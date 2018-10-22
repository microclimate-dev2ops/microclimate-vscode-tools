import * as vscode from "vscode";
import * as request from "request-promise-native";
import * as reqErrors from "request-promise-native/errors";

import * as MCUtil from "../MCUtil";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import Endpoints from "../constants/Endpoints";

export const NEW_CONNECTION_CMD_ID: string = "ext.mc.newConnection";
export const DEFAULT_CONNINFO: MCUtil.ConnectionInfo = {
    host: "localhost",
    port: 9090
};

export async function newConnectionCmd(): Promise<void> {
    console.log("New connection command invoked");

    // TODO comment this out. Only localhost is permitted.
    const inputOpts: vscode.InputBoxOptions = {
        ignoreFocusOut: true,
        prompt: "Enter the hostname or IP for the Microclimate instance you wish to connect to.",
        value: "localhost",
    };
    const hostname: string | undefined = await vscode.window.showInputBox(inputOpts);

    if (hostname == null) {
        // user cancelled
        return;
    }

    inputOpts.prompt = "Enter the Port for the Microclimate instance you wish to connect to.";
    inputOpts.value = "9090";

    let tryAgain = true;
    let port: number | undefined = undefined;
    while (tryAgain) {
        const portStr = await vscode.window.showInputBox(inputOpts);

        if (portStr == null) {
            // user cancelled
            return;
        }

        port = Number(portStr);
        if (!MCUtil.isGoodPort(port)) {
            const tryAgainMsg = "Enter a different port number";

            const result = await vscode.window.showErrorMessage(`Invalid port ${portStr} - Must be an integer between 1024 and 65536`, tryAgainMsg);
            tryAgain = result === tryAgainMsg;
        }
        else {
            // they entered a good port, we can proceed.
            break;
        }
    }

    if (hostname != null && port != null) {
        const connInfo: MCUtil.ConnectionInfo = {
            host: hostname,
            port: port
        };
        tryAddConnection(connInfo);
    }
}

/**
 * Test connecting to the given host:port.
 * If it fails, display a message to the user and allow them to either try to connect again with the same info,
 * or start the 'wizard' from the beginning to enter a new host/port.
 */
export async function tryAddConnection(connInfo: MCUtil.ConnectionInfo): Promise<void> {
    const tryAgainBtn  = "Try again";
    const reconnectBtn = "Reconnect";

    testConnection(connInfo)
        .then(async (s) => {
            // Connection succeeded, let the user know.
            // The ConnectionManager will signal the change and the UI will update accordingly.
            vscode.window.showInformationMessage(s);
        })
        .catch(async (s) => {
            console.log("Connection test failed with message " + s);
            const response = await vscode.window.showErrorMessage(s, tryAgainBtn, reconnectBtn);
            if (response === tryAgainBtn) {
                // start again from the beginning
                newConnectionCmd();
                return;
            }
            else if (response === reconnectBtn) {
                // try to connect with the same host:port
                tryAddConnection(connInfo);
                return;
            }
        });
}

// Return value resolves to a user-friendly message or error, ie "connection to $url succeeded"
async function testConnection(connInfo: MCUtil.ConnectionInfo): Promise<string> {

    const uri = MCUtil.buildMCUrl(connInfo);
    const envUri: vscode.Uri = uri.with({ path: Endpoints.ENVIRONMENT });

    const connectTimeout = 2500;

    return new Promise<string>( (_, reject) => {
        request.get(envUri.toString(), { json: true, timeout: connectTimeout })
            .then( (microclimateData: string) => {
                // Connected successfully
                return onSuccessfulConnection(uri, connInfo.host, microclimateData);
            })
            .catch( (err: any) => {
                console.log(`Request fail - ${err}`);
                if (err instanceof reqErrors.RequestError) {
                    return reject(`Connecting to Microclimate at ${uri} failed.`);
                }

                return reject(err.toString());
            });
    });
}

// microclimate_version and workspace_location were both added in Microclimate 18.09
// Portal Restart API improvement was added in 18.11
const requiredVersion: number = 1811;
const requiredVersionStr: string = "18.11";

/**
 * We've determined by this point that Microclimate is running at the given URI,
 * but we have to validate now that it's a new enough version.
 */
async function onSuccessfulConnection(mcUri: vscode.Uri, host: string, mcEnvData: any): Promise<string> {

    return new Promise<string>( (resolve, reject) => {
        console.log("Microclimate ENV data:", mcEnvData);

        if (mcEnvData == null) {
            return reject("Null microclimateData passed to onSuccessfulConnection");
        }

        const rawVersion: string = mcEnvData.microclimate_version;
        const rawWorkspace: string = mcEnvData.workspace_location;

        if (rawVersion == null || rawWorkspace == null) {
            console.error("Microclimate environment did not provide either version or workspace. Data provided is:", mcEnvData);
            return reject(`Your version of Microclimate is not supported. At least ${requiredVersionStr} is required.`);
        }

        let versionNum: number;
        if (rawVersion === "latest") {
            // This means it's being hosted by an internal MC dev.
            // There's nothing we can do here but assume they have all the features we need.
            console.log("Dev version of Microclimate");
            versionNum = Number.MAX_SAFE_INTEGER;
        }
        else {
            versionNum = Number(rawVersion);
            if (isNaN(versionNum)) {
                console.error("Couldn't convert provided version to Number, version is: " + rawVersion);
                return reject(`Could not determine Microclimate version - version is "${rawVersion}".` +
                        ` At least ${requiredVersion} is required.`);
            }
            else if (versionNum < requiredVersion) {
                console.error(`Microclimate version ${versionNum} is too old.`);
                return reject(`You are running Microclimate version ${rawVersion}, but at least ${requiredVersion} is required.`);
            }
        }

        const workspaceUri: vscode.Uri = vscode.Uri.file(rawWorkspace);

        ConnectionManager.instance.addConnection(mcUri, host, versionNum, workspaceUri)
            .then( (msg: string) => resolve(msg))
            .catch((err: string) => {
                console.log("New connection rejected by ConnectionManager ", err);
                return reject(err);
            });
    });
}