import * as vscode from "vscode";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
//import * as request from 'request';
import * as request from "request-promise-native";
import * as reqErrors from "request-promise-native/errors";

export default async function newConnectionCmd(): Promise<void> {
    console.log("New connection command invoked");

    const inputOpts = {
        ignoreFocusOut: true,
        prompt: "Enter the hostname or IP for the Microclimate instance you wish to connect to.",
        value: "localhost"
    };
    const hostname: string | undefined = await vscode.window.showInputBox(inputOpts);
    // validate

    // tslint:disable-next-line:triple-equals
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

        // tslint:disable-next-line:triple-equals
        if (portStr == null) {
            // user cancelled
            return;
        }
    
        port = Number(portStr);
        if (isNaN(port) || !Number.isInteger(port) || port > 65535 || port < 1024) {
            const tryAgainMsg = "Enter a different port number";
    
            const result = await vscode.window.showErrorMessage(`Invalid port ${portStr} - Must be an integer between 1024 and 65536`, tryAgainMsg);
            tryAgain = result === tryAgainMsg;
        }
        else {
            break;
        }
    }

    if (hostname != null && port != null) {
        return await tryAddConnection(hostname, port);
    }
}

export async function tryAddConnection(host: string, port: number): Promise<void> {
    if (host && port) {
        const tryAgainMsg = "Try again";

        testConnection(host, port)
            .then( (s) => vscode.window.showInformationMessage(s))
            .catch((s) => {
                console.error("Connection test failed with message " + s);
                vscode.window.showErrorMessage(s, tryAgainMsg)
                .then((s) => {
                    if (s === tryAgainMsg) {
                        newConnectionCmd();
                    }
                });
            });
    }
}

// Resolved promises contain a user-friendly message, ie "connection to $url succeeded"
async function testConnection(host: string, port: number): Promise<string> {
    
    const uri = ConnectionManager.buildUrl(host, port);
    const ENV_APIPATH = "api/v1/environment";
    const envUri: vscode.Uri = uri.with({ path: ENV_APIPATH });

    const connectTimeout = 2500;

    return new Promise<string>( (_, reject) => {
        request.get(envUri.toString(), { json: true, timeout: connectTimeout })
            .then( (microclimateData) => {
                // Connected successfully
                return onSuccessfulConnection(uri, microclimateData);
            })
            .catch( (err) => {
                console.log(`Request fail - ${err}`);
                if (err instanceof reqErrors.RequestError) {
                    return reject(`Connecting to Microclimate at ${uri} failed.`);
                }

                return reject(err.toString());
            });
    });
}

async function onSuccessfulConnection(mcUri: vscode.Uri, microclimateData: any): Promise<string> {

    return new Promise<string>((resolve, reject) => {
        console.log("TEST CONNECTION RESULT:");
        console.log(microclimateData);
    
        if (microclimateData == null) {
            return reject("Null test connection microclimateData");
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
    
        ConnectionManager.instance.addConnection(mcUri, workspaceUri)
            .then( () => resolve(`New connection to ${mcUri} succeeded.\nWorkspace path is: ${workspace}`))
            .catch((err: any) => { 
                console.log("New connection rejected by ConnectionManager ", err); 
                return reject(err); 
            });
    });
}