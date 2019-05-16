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

import * as MCUtil from "../MCUtil";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import Log from "../Logger";
import Commands from "../constants/Commands";
import Connection from "../microclimate/connection/Connection";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";
import MCEnvironment from "../microclimate/connection/MCEnvironment";
import InstallerWrapper from "../microclimate/connection/InstallerWrapper";

export const DEFAULT_CONNINFO: MCUtil.IConnectionInfo = {
    host: "localhost",      // non-nls
    port: 9090
};

const STRING_NS = StringNamespaces.CMD_NEW_CONNECTION;

export default async function activateConnectionCmd(): Promise<Connection | undefined> {
    Log.d("New connection command invoked");

    const connection = await tryAddConnection(DEFAULT_CONNINFO);
    if (connection == null) {
        // user gave up
        return undefined;
    }

    await offerToOpenWorkspace(connection);
    return connection;
}

async function offerToOpenWorkspace(connection: Connection): Promise<void> {
    Log.d(`offerToOpenWorkspace ${connection.url} workspace=${connection.workspacePath}`);

    let inMcWorkspace = false;
    // See if the user has this connection's workspace open
    const wsFolders = vscode.workspace.workspaceFolders;
    if (wsFolders != null) {
        inMcWorkspace = wsFolders.some((folder) => folder.uri.fsPath.includes(connection.workspacePath.fsPath));
    }

    const successMsg = Translator.t(STRING_NS, "connectionSucceeded",
            { connectionUri: connection.url, workspacePath: connection.workspacePath.fsPath }
    );
    Log.i(successMsg);

    if (!inMcWorkspace) {
        const openWsBtn = Translator.t(STRING_NS, "openWorkspaceBtn");

        // Provide a button to change their workspace to the microclimate-workspace if they wish
        vscode.window.showInformationMessage(successMsg, openWsBtn)
        .then ((response) => {
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

async function tryAddConnection(connInfo: MCUtil.IConnectionInfo): Promise<Connection | undefined> {

    Log.i("TryAddConnection", connInfo);
    const url = MCUtil.buildMCUrl(connInfo);

    let envData: MCEnvironment.IMCEnvData;
    try {
        try {
            envData = await MCEnvironment.getEnvData(url);
        }
        catch (err) {
            await InstallerWrapper.start();
            envData = await MCEnvironment.getEnvData(url);
        }
    }
    catch (err) {
        Log.e("Failed to contact codewind", err);
        vscode.window.showErrorMessage("Failed to start Codewind: " + MCUtil.errToString(err));
        return undefined;
    }

    try {
        // Connected successfully, now validate it's a good instance
        return await onSuccessfulConnection(url, connInfo.host, envData);
    }
    catch (err) {
        const errMsg = err.message || err.toString();
        Log.w("Connection test failed: " + errMsg);

        // const editBtn  = Translator.t(STRING_NS, "editConnectionBtn");
        // const retryBtn  = Translator.t(STRING_NS, "retryConnectionBtn");
        // const response = await vscode.window.showErrorMessage(errMsg, retryBtn);
        vscode.window.showErrorMessage(errMsg);
        // if (response === editBtn) {
        //     // start again from the beginning (and this command instance will terminate after this function call exits)
        //     newConnectionCmd(connInfo);
        //     return undefined;
        // }
        // if (response === retryBtn) {
        //     // try to connect with the same host:port
        //     return await tryAddConnection(connInfo);
        // }
        return undefined;
    }
}

/**
 * We've determined by this point that Microclimate is running at the given URI,
 * but we have to validate now that it's a new enough version.
 */
async function onSuccessfulConnection(mcUri: vscode.Uri, host: string, mcEnvData: MCEnvironment.IMCEnvData): Promise<Connection> {

    Log.i("ENV data:", mcEnvData);

    const rawVersion: string = mcEnvData.microclimate_version;
    const rawWorkspace: string = mcEnvData.workspace_location;
    const rawPlatform: string = mcEnvData.os_platform;

    // user_string and socket_namespace are the same on ICP, except latter starts with /
    // on local, user_string is null, and socket_namespace is "/default".
    // const rawUser: string = mcEnvData.user_string || "";
    const rawSocketNS: string = mcEnvData.socket_namespace || "";

    Log.d("rawVersion is", rawVersion);
    Log.d("rawWorkspace is", rawWorkspace);
    Log.d("rawPlatform is", rawPlatform);
    Log.d("rawSocketNS is", rawSocketNS);
    // if (rawVersion == null) {
        // throw new Error("No version information was provided by Codewind.");
    // }
    if (rawWorkspace == null) {
        throw new Error("No workspace information was provided by Codewind.");
    }

    let workspace = rawWorkspace;
    // on windows, we have to replace the unix-like workspace path with a windows one. /C/Users/... -> C:/Users/ ...
    // logic copied from Eclipse plugin
    // MicroclimateConnection.java#L244
    if (rawPlatform.toLowerCase() === "windows" && workspace.startsWith("/")) {
        const deviceLetter = workspace.substring(1, 2);
        workspace = deviceLetter + ":" + workspace.substring(2);
    }

    const versionNum = MCEnvironment.getVersionNumber(mcEnvData);

    // normalize namespace so it doesn't start with '/'
    const socketNS = rawSocketNS.startsWith("/") ? rawSocketNS.substring(1, rawSocketNS.length) : rawSocketNS;

    try {
        return await ConnectionManager.instance.addConnection(mcUri, host, versionNum, socketNS, workspace);
    }
    catch (err) {
        Log.i("New connection rejected by ConnectionManager ", err.message || err);
        throw err;
    }
}
