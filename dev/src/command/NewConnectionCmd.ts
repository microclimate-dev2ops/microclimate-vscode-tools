import * as vscode from "vscode";
import * as request from "request-promise-native";
import * as reqErrors from "request-promise-native/errors";

import * as MCUtil from "../MCUtil";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import Endpoints from "../constants/Endpoints";
import Log from "../Logger";
import Commands from "../constants/Commands";
import Connection from "../microclimate/connection/Connection";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

export const DEFAULT_CONNINFO: MCUtil.IConnectionInfo = {
    host: "localhost",      // non-nls
    port: 9090
};

// From https://github.ibm.com/dev-ex/microclimate/blob/master/docker/portal/server.js#L229
interface IMicroclimateEnvData {
    devops_available: boolean;
    editor_url: string;
    microclimate_version: string;
    running_on_icp: boolean;
    socket_namespace?: string;
    user_string?: string;
    workspace_location: string;
}

const STRING_NS = StringNamespaces.CMD_NEW_CONNECTION;

export async function newConnectionCmd(): Promise<void> {
    Log.d("New connection command invoked");

    // Only localhost is permitted. Uncomment this to (start to) support other hosts
    /*
    const inputOpts: vscode.InputBoxOptions = {
        prompt: Translator.t(STRING_NS, "enterMicroclimateHost"),
        value: DEFAULT_CONNINFO.host,
    };
    const hostname: string | undefined = await vscode.window.showInputBox(inputOpts);

    if (hostname == null) {
        // user cancelled
        return;
    }*/

    const hostname = DEFAULT_CONNINFO.host;

    let tryAgain = true;
    let port: number | undefined;
    while (tryAgain) {
        const portStr = await vscode.window.showInputBox( {
            prompt: Translator.t(STRING_NS, "enterMicroclimatePort"),
            value: DEFAULT_CONNINFO.port.toString()
        });

        if (portStr == null) {
            // user cancelled
            return;
        }

        port = Number(portStr);
        if (!MCUtil.isGoodPort(port)) {
            const tryAgainBtn = Translator.t(STRING_NS, "enterDifferentPortBtn");

            const result = await vscode.window.showErrorMessage(Translator.t(STRING_NS, "invalidPortNumber", { port: portStr }), tryAgainBtn);
            tryAgain = result === tryAgainBtn;
        }
        else {
            // they entered a good port, we can proceed.
            break;
        }
    }

    if (hostname != null && port != null) {
        const connInfo: MCUtil.IConnectionInfo = {
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
export async function tryAddConnection(connInfo: MCUtil.IConnectionInfo): Promise<void> {

    Log.i("TryAddConnection", connInfo);

    return new Promise<void>( (resolve) => {
        testConnection(connInfo)
            .then(async (connection: Connection) => {
                Log.d("TestConnection success to " + connection.mcUri);
                // Connection succeeded, let the user know.
                // The ConnectionManager will signal the change and the UI will update accordingly.

                // Check if the user has this connection's workspace folder opened.
                let inMcWorkspace = false;
                const wsFolders = vscode.workspace.workspaceFolders;
                if (wsFolders != null) {
                    inMcWorkspace = wsFolders.find( (folder) => folder.uri.fsPath.includes(connection.workspacePath.fsPath)) != null;
                }

                const successMsg = Translator.t(STRING_NS, "connectionSucceeded",
                        { connectionUri: connection.mcUri, workspacePath: connection.workspacePath.fsPath }
                );
                Log.d(successMsg);

                if (!inMcWorkspace) {
                    const openWsBtn = Translator.t(STRING_NS, "openWorkspaceBtn");

                    // Provide a button to change their workspace to the microclimate-workspace if they wish
                    vscode.window.showInformationMessage(successMsg, openWsBtn)    // non-nls
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

                const editBtn  = Translator.t(STRING_NS, "editConnectionBtn");
                const retryBtn  = Translator.t(STRING_NS, "retryConnectionBtn");
                const response = await vscode.window.showErrorMessage(s, editBtn, retryBtn);
                if (response === editBtn) {
                    // start again from the beginning
                    return newConnectionCmd();
                }
                else if (response === retryBtn) {
                    // try to connect with the same host:port
                    return tryAddConnection(connInfo);
                }
            });
    });
}

// Return value resolves to a user-friendly message or error, ie "connection to $url succeeded"
async function testConnection(connInfo: MCUtil.IConnectionInfo): Promise<Connection> {

    const uri = MCUtil.buildMCUrl(connInfo);
    const envUri: vscode.Uri = uri.with({ path: Endpoints.ENVIRONMENT });

    const connectTimeout = 2500;

    return new Promise<Connection>( (resolve, reject) => {
        request.get(envUri.toString(), { json: true, timeout: connectTimeout })
            .then( (microclimateData: IMicroclimateEnvData) => {
                // Connected successfully
                return resolve(onSuccessfulConnection(uri, connInfo.host, microclimateData));
            })
            .catch( (err: any) => {
                Log.i(`Request fail - ${err}`);
                if (err instanceof reqErrors.RequestError) {
                    return reject(Translator.t(STRING_NS, "connectFailed", { uri: uri }));
                }

                return reject(err.toString());
            });
    });
}

// microclimate_version and workspace_location were both added in Microclimate 18.09
// Portal Restart API improvement was added in 18.11
const requiredVersion: number = 1812;
const requiredVersionStr: string = "18.12";     // non-nls
const internalBuildRx: RegExp = /^\d{4}_M\d+_[EI]/;

/**
 * We've determined by this point that Microclimate is running at the given URI,
 * but we have to validate now that it's a new enough version.
 */
async function onSuccessfulConnection(mcUri: vscode.Uri, host: string, mcEnvData: IMicroclimateEnvData): Promise<Connection> {

    return new Promise<Connection>( (resolve, reject) => {
        Log.i("Microclimate ENV data:", mcEnvData);

        if (mcEnvData == null) {
            Log.e("Null microclimateData passed to onSuccessfulConnection");
            // fail with a generic message because this should never happen
            reject(Translator.t(STRING_NS, "connectFailed", { uri: mcUri }));
        }

        const rawVersion: string = mcEnvData.microclimate_version;
        const rawWorkspace: string = mcEnvData.workspace_location;

        Log.d("rawVersion from Microclimate is", rawVersion);
        Log.d("rawWorkspace from Microclimate is", rawWorkspace);
        if (rawVersion == null || rawWorkspace == null) {
            Log.e("Microclimate environment did not provide either version or workspace. Data provided is:", mcEnvData);
            return reject(Translator.t(STRING_NS, "versionNotProvided", { requiredVersion: requiredVersionStr }));
        }

        let versionNum: number;
        if (rawVersion === "latest") {      // non-nls
            // This means it's being hosted by an internal MC dev.
            // There's nothing we can do here but assume they have all the features we need.
            Log.i("Dev version of Microclimate");
            versionNum = Number.MAX_SAFE_INTEGER;
        }
        else if (rawVersion.match(internalBuildRx) != null) {
            Log.i("Internal build of Microclimate");
            versionNum = Number.MAX_SAFE_INTEGER;
        }
        else {
            versionNum = Number(rawVersion);
            if (isNaN(versionNum)) {
                Log.e("Couldn't convert provided version to Number, version is: " + rawVersion);
                return reject(Translator.t(STRING_NS, "versionNotRecognized", { rawVersion: rawVersion, requiredVersion: requiredVersionStr}));
            }
            else if (versionNum < requiredVersion) {
                Log.e(`Microclimate version ${versionNum} is too old.`);
                return reject(Translator.t(STRING_NS, "versionTooOld", { rawVersion: rawVersion, requiredVersion: requiredVersionStr}));
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
