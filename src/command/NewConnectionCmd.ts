import { window, Uri } from "vscode";
import ConnectionManager from "../microclimate/connections/ConnectionManager";
import * as request from "request-promise-native";


export default async function newConnectionCmd() {
    console.log("New connection command invoked");

    const inputOpts = {
        ignoreFocusOut: true,
        prompt: "Enter the hostname or IP for the Microclimate instance you wish to connect to.",
        value: "localhost"
    };
    const hostname: string | undefined = await window.showInputBox(inputOpts);
    // validate

    // tslint:disable-next-line:triple-equals
    if (hostname == null) {
        // user cancelled
        return;
    }

    inputOpts.prompt = "Enter the Port for the Microclimate instance you wish to connect to.";
    inputOpts.value = "9090";

    let tryAgain = true;
    let port = undefined;
    while (tryAgain) {
        const portStr = await window.showInputBox(inputOpts);

        // tslint:disable-next-line:triple-equals
        if (portStr == null) {
            // user cancelled
            return;
        }
    
        port = Number(portStr);
        if (isNaN(port) || !Number.isInteger(port) || port > 65535 || port < 1024) {
            const tryAgainMsg = "Enter a different port number";
    
            const result = await window.showErrorMessage(`Invalid port ${portStr} - Must be a positive integer between 1024 and 65536`, tryAgainMsg);
            tryAgain = result === tryAgainMsg;
        }
        else {
            break;
        }
    }

    if (hostname && port) {
        const tryAgainMsg = "Try Again";

        testConnection(hostname, port)
            .then( (s) => window.showInformationMessage(s))
            .catch((s) => {
                window.showErrorMessage(s, tryAgainMsg)
                .then((s) => {
                    if (s === tryAgainMsg) {
                        newConnectionCmd();
                    }
                });
            });
    }
}

async function testConnection(host: string, port: number): Promise<string> {
    
    const uri = ConnectionManager.buildUrl(host, port);
    const ENV_APIPATH = "api/v1/environment";
    const envUri: Uri = uri.with( { path: ENV_APIPATH });

    const result = await request.get(envUri.toString(), { json : true });    

    return new Promise<string>( (resolve, reject) => {
        console.log("TEST CONNECTION RESULT:");
        console.log(result);
    
        if (result == null) {
            reject("Null test connection result");
        }
    
        // is this 'safe' enough?
        const version = result.microclimate_version;
        if (version == null) {
            reject("Could not determine Microclimate version");
        }
        else if (version !== "latest" /* or version is not new enough */) {
            reject(`Microclimate version ${version} is not supported`);
        }

        const workspace = result.workspace_location;
        if (workspace == null) {
            reject("Workspace location was missing from environment data");
        }
        const workspaceUri = Uri.file(workspace);

        ConnectionManager.instance.addConnection(uri, workspaceUri);
        resolve(`New connection to ${uri} succeeded.\nWorkspace path is: ${workspace}`);
    });
}

export {
    newConnectionCmd
};