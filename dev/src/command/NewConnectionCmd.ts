import * as vscode from "vscode";
import * as request from "request-promise-native";
import * as reqErrors from "request-promise-native/errors";

import * as MCUtil from "../MCUtil";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import Endpoints from "../constants/Endpoints";
import Log from "../Logger";
import Commands from "../constants/Commands";
import Connection from "../microclimate/connection/Connection";

export const DEFAULT_CONNINFO: MCUtil.ConnectionInfo = {
    host: "localhost",
    port: 9090
};

export async function newConnectionCmd(): Promise<void> {
    Log.d("New connection command invoked");

    // Only localhost is permitted. Uncomment this to (start to) support other hosts
    /*
    const inputOpts: vscode.InputBoxOptions = {
        prompt: "Enter the hostname or IP for the Microclimate instance you wish to connect to.",
        value: DEFAULT_CONNINFO.host,
    };
    const hostname: string | undefined = await vscode.window.showInputBox(inputOpts);

    if (hostname == null) {
        // user cancelled
        return;
    }*/

    const hostname = "localhost";

    let tryAgain = true;
    let port: number | undefined = undefined;
    while (tryAgain) {
        const portStr = await vscode.window.showInputBox( {
            prompt: "Enter the Port for the local Microclimate instance you wish to connect to.",
            value: DEFAULT_CONNINFO.port.toString()
        });

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
        return tryAddConnection(connInfo);
    }
}

/**
 * Test connecting to the given host:port.
 * If it fails, display a message to the user and allow them to either try to connect again with the same info,
 * or start the 'wizard' from the beginning to enter a new host/port.
 */
export async function tryAddConnection(connInfo: MCUtil.ConnectionInfo): Promise<void> {

    Log.i("TryAddConnection", connInfo);

    return new Promise<void>( (resolve) => {
        testConnection(connInfo)
            .then(async (connection: Connection) => {
                const successMsg = `New connection to ${connection.mcUri} succeeded.`;
                const workspaceMsg = `Workspace path is: ${connection.workspacePath.fsPath}`;
                Log.i(successMsg, workspaceMsg);

                // Connection succeeded, let the user know.
                // The ConnectionManager will signal the change and the UI will update accordingly.

                if (vscode.workspace.getWorkspaceFolder(connection.workspacePath) == null) {
                    // this means the user does not have this connection's workspace folder opened.
                    // Provide a button to change their workspace to the microclimate-workspace if they wish
                    const openWsBtn = "Open workspace";

                    vscode.window.showInformationMessage(successMsg + " " + workspaceMsg, openWsBtn)
                        .then ( (response) => {
                            if (response === openWsBtn) {
                                vscode.commands.executeCommand(Commands.VSC_OPEN_FOLDER, connection.workspacePath);
                            }
                        });
                }
                else {
                    // The user already has the workspace open, we don't have to do it for them.
                    vscode.window.showInformationMessage(successMsg);
                }

                return resolve();
            })
            .catch(async (s: any) => {
                Log.w("Connection test failed with message " + s);

                const tryAgainBtn  = "Try again";
                const reconnectBtn = "Reconnect";
                const response = await vscode.window.showErrorMessage(s, tryAgainBtn, reconnectBtn);
                if (response === tryAgainBtn) {
                    // start again from the beginning
                    return newConnectionCmd();
                }
                else if (response === reconnectBtn) {
                    // try to connect with the same host:port
                    return tryAddConnection(connInfo);
                }
            });
    });
}

// Return value resolves to a user-friendly message or error, ie "connection to $url succeeded"
async function testConnection(connInfo: MCUtil.ConnectionInfo): Promise<Connection> {

    const uri = MCUtil.buildMCUrl(connInfo);
    const envUri: vscode.Uri = uri.with({ path: Endpoints.ENVIRONMENT });

    const connectTimeout = 2500;

    return new Promise<Connection>( (resolve, reject) => {
        request.get(envUri.toString(), { json: true, timeout: connectTimeout })
            .then( (microclimateData: string) => {
                // Connected successfully
                return resolve(onSuccessfulConnection(uri, connInfo.host, microclimateData));
            })
            .catch( (err: any) => {
                Log.i(`Request fail - ${err}`);
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
async function onSuccessfulConnection(mcUri: vscode.Uri, host: string, mcEnvData: any): Promise<Connection> {

    return new Promise<Connection>( (resolve, reject) => {
        Log.i("Microclimate ENV data:", mcEnvData);

        if (mcEnvData == null) {
            return reject("Null microclimateData passed to onSuccessfulConnection");
        }

        const rawVersion: string = mcEnvData.microclimate_version;
        const rawWorkspace: string = mcEnvData.workspace_location;

        if (rawVersion == null || rawWorkspace == null) {
            Log.e("Microclimate environment did not provide either version or workspace. Data provided is:", mcEnvData);
            return reject(`Your version of Microclimate is not supported. At least ${requiredVersionStr} is required.`);
        }

        let versionNum: number;
        if (rawVersion === "latest") {
            // This means it's being hosted by an internal MC dev.
            // There's nothing we can do here but assume they have all the features we need.
            Log.i("Dev version of Microclimate");
            versionNum = Number.MAX_SAFE_INTEGER;
        }
        else {
            versionNum = Number(rawVersion);
            if (isNaN(versionNum)) {
                Log.e("Couldn't convert provided version to Number, version is: " + rawVersion);
                return reject(`Could not determine Microclimate version - version is "${rawVersion}".` +
                        ` At least ${requiredVersion} is required.`);
            }
            else if (versionNum < requiredVersion) {
                Log.e(`Microclimate version ${versionNum} is too old.`);
                return reject(`You are running Microclimate version ${rawVersion}, but at least ${requiredVersion} is required.`);
            }
        }

        const workspaceUri: vscode.Uri = vscode.Uri.file(rawWorkspace);

        ConnectionManager.instance.addConnection(mcUri, host, versionNum, workspaceUri)
            .then( (newConnection: Connection) => {
                return resolve(newConnection);
            })
            .catch((err: string) => {
                Log.i("New connection rejected by ConnectionManager ", err);
                return reject(err);
            });
    });
}