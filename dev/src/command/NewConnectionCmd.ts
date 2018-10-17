import * as vscode from "vscode";
import * as request from "request-promise-native";
import * as reqErrors from "request-promise-native/errors";

import * as MCUtil from "../MCUtil";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import Endpoints from "../constants/Endpoints";

export const CMD_OPEN_FOLDER = "ext.mc.openWorkspaceFolder";

export default async function newConnectionCmd(): Promise<void> {
    console.log("New connection command invoked");

    // TODO comment this out. Only localhost is permitted.
    const inputOpts: vscode.InputBoxOptions = {
        ignoreFocusOut: true,
        prompt: "Enter the hostname or IP for the Microclimate instance you wish to connect to. [ESC] to cancel.",
        value: "localhost",
    };
    const hostname: string | undefined = await vscode.window.showInputBox(inputOpts);

    if (hostname == null) {
        // user cancelled
        return;
    }

    inputOpts.prompt = "Enter the Port for the Microclimate instance you wish to connect to. [ESC] to cancel.";
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
        tryAddConnection(hostname, port);
    }
}

/**
 * Test connecting to the given host:port.
 * If it fails, display a message to the user and allow them to either try to connect again with the same info,
 * or start the 'wizard' from the beginning to enter a new host/port.
 */
export async function tryAddConnection(host: string, port: number): Promise<void> {
    const tryAgainMsg = "Try again";
    const reconnectMsg = "Reconnect";

    testConnection(host, port)
        .then( async (s) => {
            // Connection succeeded, let the user know.
            // The ConnectionManager will signal the change and the UI will update accordingly.
            vscode.window.showInformationMessage(s);
        })
        .catch(async (s) => {
            console.log("Connection test failed with message " + s);
            const response = await vscode.window.showErrorMessage(s, tryAgainMsg, reconnectMsg);
            if (response === tryAgainMsg) {
                // start again from the beginning
                newConnectionCmd();
                return;
            }
            else if (response === reconnectMsg) {
                // try to connect with the same host:port
                tryAddConnection(host, port);
                return;
            }
        });
}

// Return value resolves to a user-friendly message or error, ie "connection to $url succeeded"
async function testConnection(host: string, port: number): Promise<string> {

    const uri = ConnectionManager.buildUrl(host, port);
    const envUri: vscode.Uri = uri.with({ path: Endpoints.ENVIRONMENT });

    const connectTimeout = 2500;

    return new Promise<string>( (_, reject) => {
        request.get(envUri.toString(), { json: true, timeout: connectTimeout })
            .then( (microclimateData: string) => {
                // Connected successfully
                return onSuccessfulConnection(uri, host, microclimateData);
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

async function onSuccessfulConnection(mcUri: vscode.Uri, host:string, microclimateData: any): Promise<string> {

    return new Promise<string>( (resolve, reject) => {
        console.log("Microclimate ENV data:", microclimateData);

        if (microclimateData == null) {
            return reject("Null microclimateData passed to onSuccessfulConnection");
        }

        const version = microclimateData.microclimate_version;
        if (version == null) {
            return reject("Could not determine Microclimate version");
        }
        else if (version !== "latest" /* or version is not new enough */) {
            return reject(`Microclimate version "${version}" is not supported`);
        }

        const workspace = microclimateData.workspace_location;
        if (workspace == null) {
            return reject("Workspace location was missing from environment data");
        }
        const workspaceUri = vscode.Uri.file(workspace);

        ConnectionManager.instance.addConnection(mcUri, host, workspaceUri)
            .then( (msg: string) => resolve(msg))
            .catch((err: string) => {
                console.log("New connection rejected by ConnectionManager ", err);
                return reject(err);
            });
    });
}