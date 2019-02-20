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
import Connection from "./Connection";
import Translator from "../../constants/strings/translator";
import Commands from "../../constants/Commands";
import { newConnectionCmd } from "../../command/NewConnectionCmd";
import ConnectionManager from "./ConnectionManager";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import * as MCUtil from "../../MCUtil";
import Requester from "../project/Requester";
import MCEnvironment from "./MCEnvironment";
import Authenticator from "./auth/Authenticator";
import { IConnectionData } from "./ConnectionData";
import refreshConnectionCmd from "../../command/RefreshConnectionCmd";

const STRING_NS = StringNamespaces.CMD_NEW_CONNECTION;

namespace ConnectionFactory {
    /**
     * Test connecting to the given host:port.
     * If it fails, display a message to the user and allow them to either try to connect again with the same info,
     * or start the 'wizard' from the beginning to enter a new host/port.
     *
     * Should handle and display errors, and never throw an error.
     */
    export async function tryAddConnection(mcUrl: vscode.Uri): Promise<Connection | undefined> {

        Log.i("TryAddConnection to: " + mcUrl.toString());

        if (ConnectionManager.instance.connectionExists(mcUrl)) {
            vscode.window.showWarningMessage(Translator.t(STRING_NS, "connectionAlreadyExists", { uri: mcUrl }));
            return undefined;
        }
        Log.d("Connection does not already exist");

        let newConnection: Connection;
        try {
            newConnection = await testConnection(mcUrl);
            Log.d("TestConnection success to " + newConnection.mcUrl);
        }
        catch (err) {
            Log.w("Connection test failed:", err);

            const errMsg = err.message || err.toString();
            const editBtn = Translator.t(STRING_NS, "editConnectionBtn");
            const retryBtn = Translator.t(STRING_NS, "retryConnectionBtn");
            const openUrlBtn = "Open URL";
            vscode.window.showErrorMessage(errMsg, editBtn, retryBtn, openUrlBtn)
            .then( (response) => {
                if (response === editBtn) {
                    // start again from the beginning, with the same uri prefilled
                    return newConnectionCmd(mcUrl);
                }
                else if (response === retryBtn) {
                    // try to connect with the same uri
                    return tryAddConnection(mcUrl);
                }
                else if (response === openUrlBtn) {
                    vscode.commands.executeCommand(Commands.VSC_OPEN, mcUrl);
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
            connection = await testConnection(connectionData.url);
        }
        catch (err) {
            // This is fine - the Microclimate instance became unreachable while VS Code was closed
            // Still show it in the tree, but as Disconnected
            Log.d("Failed to re-add connection the normal way, adding as disconnected");

            connection = await ConnectionManager.instance.addConnection(connectionData);
            connection.onDisconnect();

            const errMsg = err.message || err.toString();
            const retryBtn = Translator.t(STRING_NS, "retryConnectionBtn");
            const openUrlBtn = "Open URL";

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
async function testConnection(mcUrl: vscode.Uri): Promise<Connection> {

    const rqOptions: request.RequestPromiseOptions = {
        json: true,
        timeout: 5000,
        resolveWithFullResponse: true,
        rejectUnauthorized: Requester.shouldRejectUnauthed(mcUrl.toString()),
    };

    const token = Authenticator.getAccessTokenForUrl(mcUrl);
    if (token != null) {
        Log.d("Sending auth token with connect request");
        rqOptions.auth = {
            bearer: token
        };
    }

    Log.d("Testing connection now");

    let testResponse: request.FullResponse | undefined;
    try {
        const connectRequestPromise: request.RequestPromise = request.get(mcUrl.toString(), rqOptions);

        // For remote, show a connecting-in-progress message. Localhost is too fast for this to be useful.
        if (!MCUtil.isLocalhost(mcUrl.authority)) {
            testResponse = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Connecting to ${mcUrl.toString()}`
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
                throw new Error(`Connecting to ${mcUrl} failed: ${err.statusCode}${err.error ? err.error : ""}`);            // nls
            }
        }
        else if (err instanceof reqErrors.RequestError) {
            // eg "connection refused", "getaddrinfo failed"
            // throw new Error(Translator.t(STRING_NS, "connectFailed", { uri: uri }));
            throw new Error(`Connecting to ${mcUrl} failed: ${err.message}`);                    // nls
        }
        throw err;
    }

    if (testResponse == null) {
        // should never happen
        Log.d("testResponse is null!");
        throw new Error(`Connecting to ${mcUrl} failed: Unknown error`);
    }
    Log.d(`Initial response from ${mcUrl} status=${testResponse.statusCode} requestPath=${testResponse.request.path}`);
    if (testResponse.body.toString().length < 512) {
        Log.d("Initial response body", testResponse.body);
    }
    else {
        Log.d("Initial response body is too long to log!");
    }

    // Connection succeeded, which means status code is success - but the response could be anything,
    // like a 404 or a login page, or something totally unrelated to Microclimate
    // If we have to log into ICP, we'll get redirected to OIDC authorize endpoint /oidc/endpoint/OP/authorize
    if (testResponse.statusCode === 401 ||
        testResponse.request.path.toLowerCase().includes("oidc")) {

        // will throw if auth fails
        await Authenticator.authenticate(mcUrl.authority);
    }

    // Auth either was not necessary, or suceeded above - then there will be a token that this request can use
    const envData = await MCEnvironment.getEnvData(mcUrl);
    return onSuccessfulConnection(mcUrl, envData);
}

/**
 * Validate that the MC version connected to is new enough,
 * then pass the MC info to one of either the new Local or ICP connection handlers.
 */
async function onSuccessfulConnection(mcUrl: vscode.Uri, mcEnvData: MCEnvironment.IMCEnvData): Promise<Connection> {
    Log.i("Microclimate ENV data:", mcEnvData);

    const rawVersion: string = mcEnvData.microclimate_version;
    if (rawVersion == null) {
        Log.e("Microclimate environment did not provide either version or workspace. Data provided is:", mcEnvData);
        throw new Error(Translator.t(STRING_NS, "versionNotProvided", { requiredVersion: MCEnvironment.REQUIRED_VERSION_STR }));
    }

    const versionNum = MCEnvironment.getVersionNumber(mcUrl.toString(), mcEnvData);

    // At this point, we know the Microclimate we're trying to connect to is a supported version.
    if (mcEnvData.running_on_icp) {
        return onICPConnection(mcUrl, versionNum, mcEnvData as MCEnvironment.IMCEnvDataICP);
    }
    else {
        return onLocalConnection(mcUrl, versionNum, mcEnvData as MCEnvironment.IMCEnvDataLocal);
    }
}

async function onLocalConnection(mcUrl: vscode.Uri, versionNum: number, mcEnvData: MCEnvironment.IMCEnvDataLocal): Promise<Connection> {
    const rawWorkspace: string = mcEnvData.workspace_location;

    Log.d("rawWorkspace from Microclimate is", rawWorkspace);
    if (rawWorkspace == null) {
        Log.e("Local Microclimate did not provide workspace. Data provided is:", mcEnvData);
        throw new Error(Translator.t(STRING_NS, "versionNotProvided", { requiredVersion: MCEnvironment.REQUIRED_VERSION_STR }));
    }

    let user = mcEnvData.user_string;
    // might be something like null or false
    if (!user) {
        user = "";
    }
    return ConnectionManager.instance.addConnection({
        url: mcUrl,
        version: versionNum,
        workspacePath: rawWorkspace,
        user
    });
}

async function onICPConnection(mcUrl: vscode.Uri, versionNum: number, mcEnvData: MCEnvironment.IMCEnvDataICP): Promise<Connection> {
    const dummyWorkspace = path.join(os.homedir(), "microclimate-dummy-workspace");
    if (!fs.existsSync(dummyWorkspace)) {
        fs.mkdirSync(dummyWorkspace, { recursive: true });
    }

    // right now socket_namespace is just `/${user_string}`. There should always be a user_string on ICP.
    return ConnectionManager.instance.addConnection({
        url: mcUrl,
        version: versionNum,
        workspacePath: dummyWorkspace,
        user: mcEnvData.user_string
    });
}

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