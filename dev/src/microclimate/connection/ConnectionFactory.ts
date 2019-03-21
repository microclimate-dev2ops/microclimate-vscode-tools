/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import * as request from "request-promise-native";
import * as reqErrors from "request-promise-native/errors";

import Log from "../../Logger";
import { Connection } from "./ConnectionExporter";
import Translator from "../../constants/strings/translator";
import Commands from "../../constants/Commands";
import ConnectionManager from "./ConnectionManager";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import MCUtil from "../../MCUtil";
import Requester from "../project/Requester";
import MCEnvironment from "./MCEnvironment";
import Authenticator from "./auth/Authenticator";
import { IConnectionData } from "./ConnectionData";
import refreshConnectionCmd from "../../command/RefreshConnectionCmd";
import ICPInfoMap from "./ICPInfoMap";

const STRING_NS = StringNamespaces.CMD_NEW_CONNECTION;

namespace ConnectionFactory {

    /**
     * Test connecting to Microclimate at the given URL.
     * If it fails, display a message to the user and allow them to either try to connect again with the same info,
     * or start the 'wizard' from the beginning to enter a new url.
     *
     * @param kubeNamespace - Set iff this is an ICP connection
     *
     * Should handle and display errors, and never throw an error.
     */
    export async function tryAddConnection(ingressUrl: vscode.Uri, kubeNamespace?: string): Promise<Connection | undefined> {

        Log.i("TryAddConnection to:", ingressUrl);

        if (ConnectionManager.instance.connectionExists(ingressUrl)) {
            vscode.window.showWarningMessage(Translator.t(STRING_NS, "connectionAlreadyExists", { uri: ingressUrl }));
            return undefined;
        }
        Log.d("Connection does not already exist");

        let newConnection: Connection;
        try {
            newConnection = await testConnection(ingressUrl, kubeNamespace);
            Log.d("TestConnection success to " + newConnection.mcUrl);
        }
        catch (err) {
            Log.w("Connection test failed:", err);

            const errMsg = MCUtil.errToString(err);
            const retryBtn = Translator.t(STRING_NS, "retryConnectionBtn");
            const openUrlBtn = Translator.t(STRING_NS, "openUrlBtn");
            vscode.window.showErrorMessage(errMsg, retryBtn, openUrlBtn)
            .then( (response) => {
                if (response === retryBtn) {
                    // try to connect with the same uri
                    return tryAddConnection(ingressUrl);
                }
                else if (response === openUrlBtn) {
                    vscode.commands.executeCommand(Commands.VSC_OPEN, ingressUrl);
                }
                return undefined;
            });
            return undefined;
        }

        if (newConnection == null) {
            return undefined;
        }

        // Connection succeeded, let the user know.
        // The ConnectionManager will signal the change and the UI will update accordingly.

        // Offer the open the workspace. Don't have to wait for this.
        offerToOpenWorkspace(newConnection);
        return newConnection;
    }

    /**
     * Meant to be used when loading connections on extension restart, or when using the Refresh command.
     * The Microclimate instance must have been connected to previously so that we have all the connectionData available.
     *
     * The key difference is that the connection is still added to the ConnectionManager (and therefore the tree view)
     * even if the Microclimate instance cannot be reached.
     */
    export async function reAddConnection(connectionData: IConnectionData): Promise<Connection> {
        Log.i("Re-add connection", connectionData);
        let connection: Connection;
        try {
            connection = await testConnection(connectionData.url, connectionData.kubeNamespace);
        }
        catch (err) {
            // This is fine - the Microclimate instance became unreachable while VS Code was closed, or we have to re-authenticate
            // Still show it in the tree, but as Disconnected
            Log.i("Failed to re-add connection the normal way, adding as disconnected. err:", err);

            const isICP = connectionData.kubeNamespace != null;
            connection = await ConnectionManager.instance.addConnection(isICP, connectionData);
            connection.onDisconnect();

            const errMsg = MCUtil.errToString(err);
            const retryBtn = Translator.t(STRING_NS, "retryConnectionBtn");
            const openUrlBtn = Translator.t(STRING_NS, "openUrlBtn");

            vscode.window.showWarningMessage(errMsg, retryBtn, openUrlBtn)
            .then( (response) => {
                if (response === openUrlBtn) {
                    vscode.commands.executeCommand(Commands.VSC_OPEN, connectionData.url);
                }
                else if (response === retryBtn) {
                    refreshConnectionCmd(connection);
                }
            });
        }
        return connection;
    }
}

// Return value resolves to a user-friendly message or error, ie "connection to $url succeeded"
async function testConnection(ingressUrl: vscode.Uri, kubeNamespace?: string): Promise<Connection> {

    const rqOptions: request.RequestPromiseOptions = {
        json: true,
        timeout: 10000,
        resolveWithFullResponse: true,
        rejectUnauthorized: Requester.shouldRejectUnauthed(ingressUrl.toString()),
    };

    const isICP: boolean = kubeNamespace != null;

    const tokenset = Authenticator.getTokensetFor(ingressUrl);
    if (tokenset != null) {
        Log.d("Sending auth token with connect request");
        rqOptions.auth = {
            bearer: tokenset.access_token
        };
    }
    else if (!isICP) {
        Log.d("No auth token available for remote host, auth will be required");
    }

    Log.d("Testing connection now");

    let testResponse: request.FullResponse | undefined;
    try {
        const connectRequestPromise: request.RequestPromise = request.get(ingressUrl.toString(), rqOptions);

        // For remote, show a connecting-in-progress message. Localhost is too fast for this to be useful.
        if (isICP) {
            testResponse = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Connecting to ${ingressUrl.toString()}`
            }, async (_progress, _token): Promise<request.FullResponse> => {
                return await connectRequestPromise;
            });
        }
        else {
            testResponse = await connectRequestPromise;
        }
    }
    catch (err) {
        Log.i(`New connection request fail`, err);
        if (err instanceof reqErrors.StatusCodeError) {
            if (err.statusCode !== 401) {
                // 401 is handled below
                // err.message will often be an entire html page so let's not show that.
                throw new Error(`Connecting to ${ingressUrl} failed: ${err.statusCode}${err.error ? err.error : ""}`);            // nls
            }
        }
        else if (err instanceof reqErrors.RequestError) {
            // eg "connection refused", "getaddrinfo failed"
            // throw new Error(Translator.t(STRING_NS, "connectFailed", { uri: uri }));
            throw new Error(`Connecting to ${ingressUrl} failed: ${err.message}`);                    // nls
        }
        throw err;
    }

    if (testResponse == null) {
        // should never happen
        Log.d("testResponse is null!");
        throw new Error(`Connecting to ${ingressUrl} failed: Unknown error`);
    }
    Log.d(`Initial response from ${ingressUrl} status=${testResponse.statusCode} requestPath=${testResponse.request.path}`);
    if (testResponse.body.toString().length < 512) {
        Log.d("Initial response body", testResponse.body);
    }

    // Connection succeeded, which means status code is success - but the response could be anything,
    // like a login page, or something totally unrelated to Microclimate
    // If we have to log into ICP, we'll get redirected to OIDC authorize endpoint /oidc/endpoint/OP/authorize
    if (testResponse.statusCode === 401 ||
        testResponse.request.path.toLowerCase().includes("oidc")) {

        const masterHost = ICPInfoMap.getMasterHost(ingressUrl);
        if (masterHost == null) {
            // This should never happen
            throw new Error(`No corresponding master node IP was stored for ${ingressUrl}. Please try re-creating the connection.`);
        }
        Log.d("Authentication is required");
        // will throw if auth fails
        await Authenticator.authenticate(masterHost);
        Log.d("Authentication completed");
    }

    // Auth either was not necessary, or suceeded above - then there will be a token that this request can use
    const mcEnvData = await MCEnvironment.getEnvData(ingressUrl);
    Log.i("Microclimate ENV data:", mcEnvData);

    const rawVersion: string = mcEnvData.microclimate_version;
    if (rawVersion == null) {
        Log.e("Microclimate environment did not provide either version or workspace. Data provided is:", mcEnvData);
        throw new Error(Translator.t(STRING_NS, "versionNotProvided", { requiredVersion: MCEnvironment.REQUIRED_VERSION_STR }));
    }

    // check if version is good
    const versionNum = MCEnvironment.getVersionNumber(ingressUrl.toString(), mcEnvData);
    const workspacePath = await getWorkspacePath(ingressUrl, mcEnvData);

    return ConnectionManager.instance.addConnection(isICP, {
        kubeNamespace,
        socketNamespace: mcEnvData.socket_namespace,
        user: mcEnvData.user_string,
        url: ingressUrl,
        version: versionNum,
        workspacePath,
    });
}

export const REMOTE_WORKSPACE_DIRNAME = `microclimate-remote-workspace`;
export const REMOTE_WORKSPACE_URLFILE = `.microclimate-url`;
const URLFILE_ENCODING = "utf8";

async function getWorkspacePath(mcUrl: vscode.Uri, mcEnvData: MCEnvironment.IMCEnvData): Promise<string> {
    if (!mcEnvData.running_on_icp) {
        const workspace: string | undefined = mcEnvData.workspace_location;

        Log.d("workspace from Microclimate is", workspace);
        if (workspace == null) {
            Log.e("Local Microclimate did not provide workspace. Data provided is:", mcEnvData);
            throw new Error(Translator.t(STRING_NS, "versionNotProvided", { requiredVersion: MCEnvironment.REQUIRED_VERSION_STR }));
        }
        else if (!fs.existsSync(workspace)) {
            throw new Error(`Workspace directory does not exist. Path is "${workspace}"`);
        }
        return workspace;
    }

    // remote ws location could be a user setting
    const remoteWorkspace = path.join(os.homedir(), REMOTE_WORKSPACE_DIRNAME);
    // we write the ingressUrl to this file to track the Microclimate instance that the workspace maps to
    const mcUrlFile = path.join(remoteWorkspace, REMOTE_WORKSPACE_URLFILE);
    let createWorkspace = true;
    if (fs.existsSync(remoteWorkspace)) {
        Log.d(`Remote workspace ${remoteWorkspace} already exists`);

        let wipeWorkspace = true;
        if (fs.existsSync(mcUrlFile)) {
            const workspaceMcUrl = fs.readFileSync(mcUrlFile).toString(URLFILE_ENCODING);
            if (workspaceMcUrl !== mcUrl.toString()) {
                const positiveResponse = "Yes";
                const res = await vscode.window.showInformationMessage(
                    `${remoteWorkspace} already exists, but was used with a different Microclimate instance, ${workspaceMcUrl}. ` +
                    `The contents of this directory will be deleted. Are you sure you want to proceed?`,
                    { modal: true }, positiveResponse
                );

                if (res !== positiveResponse) {
                    throw new Error("Cancelled");
                }
            }
            else {
                Log.d("Workspace's mcUrl matches previous, leaving contents intact");
                createWorkspace = false;
                wipeWorkspace = false;
            }
        }

        if (wipeWorkspace) {
            Log.i("Deleting contents of remote workspace");
            fs.unlinkSync(remoteWorkspace);
        }
    }
    if (createWorkspace) {
        Log.i("Creating remote workspace");
        fs.mkdirSync(remoteWorkspace);
        fs.writeFileSync(mcUrlFile, mcUrl.toString(), { encoding: URLFILE_ENCODING });
    }

    return remoteWorkspace;
}

/**
 * Display a message to the user that the connection succeeded.
 * Then, if that connection's workspace is NOT open, display a popup with a button to open that folder.
 */
async function offerToOpenWorkspace(connection: Connection): Promise<void> {
    let inMcWorkspace = false;
    // See if the user has this connection's workspace open
    const wsFolders = vscode.workspace.workspaceFolders;
    if (wsFolders != null) {
        inMcWorkspace = wsFolders.some( (folder) => folder.uri.fsPath.includes(connection.workspacePath.fsPath));
    }

    const successMsg = Translator.t(STRING_NS, "connectionSucceeded",
            { connectionUri: connection.mcUrl, workspacePath: connection.workspacePath.fsPath }
    );
    Log.i(successMsg);

    if (!inMcWorkspace) {
        const openWsBtn = Translator.t(STRING_NS, "openWorkspaceBtn");

        // Provide a button to change their workspace to the microclimate-workspace if they wish
        vscode.window.showInformationMessage(successMsg, openWsBtn)
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
}

export default ConnectionFactory;
