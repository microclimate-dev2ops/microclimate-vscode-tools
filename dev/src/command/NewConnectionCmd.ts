/*******************************************************************************
 * Copyright (c) 2018 IBM Corporation and others.
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

export const DEFAULT_CONNINFO: MCUtil.IConnectionInfo = {
    host: "localhost",      // non-nls
    port: 9090
};

const STRING_NS = StringNamespaces.CMD_NEW_CONNECTION;

export async function newConnectionCmd(connInfo?: MCUtil.IConnectionInfo): Promise<Connection | undefined> {
    Log.d("New connection command invoked");

    if (connInfo == null) {
        // Get it from the user
        connInfo = await getConnectInfo();
        if (connInfo == null) {
            Log.d("User cancelled entering connect info");
            // If the user didn't enter anything valid, exit here
            return undefined;
        }
    }

    const connection = await tryAddConnection(connInfo);
    if (connection == null) {
        // user gave up
        return undefined;
    }

    await offerToOpenWorkspace(connection);
    return connection;
}

async function getConnectInfo(): Promise<MCUtil.IConnectionInfo | undefined> {
    Log.d("Prompting for connect info");

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

    const host = DEFAULT_CONNINFO.host;

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

    if (host == null || port == null) {
        // user never entered anything valid
        return undefined;
    }

    return { host, port };
}

async function offerToOpenWorkspace(connection: Connection): Promise<void> {
    let inMcWorkspace = false;
    // See if the user has this connection's workspace open
    const wsFolders = vscode.workspace.workspaceFolders;
    if (wsFolders != null) {
        inMcWorkspace = wsFolders.some( (folder) => folder.uri.fsPath.includes(connection.workspacePath.fsPath));
    }

    const successMsg = Translator.t(STRING_NS, "connectionSucceeded",
            { connectionUri: connection.mcUri, workspacePath: connection.workspacePath.fsPath }
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

/**
 * Test connecting to the given host:port.
 *
 * If it fails, display a message to the user and allow them to either try to connect again with the same info,
 * or start the 'wizard' from the beginning to enter a new host/port.
 *
 * @returns The new Connection if we formed one, or undefined if we didn't.
 */
export async function tryAddConnection(connInfo: MCUtil.IConnectionInfo): Promise<Connection | undefined> {

    Log.i("TryAddConnection", connInfo);

    try {
        const uri = MCUtil.buildMCUrl(connInfo);
        const microclimateData = await MCEnvironment.getEnvData(uri);
        // Connected successfully, now validate it's a good instance
        return await onSuccessfulConnection(uri, connInfo.host, microclimateData);
    }
    catch (err) {
        const errMsg = err.message || err.toString();
        Log.w("Connection test failed: " + errMsg);

        const editBtn  = Translator.t(STRING_NS, "editConnectionBtn");
        const retryBtn  = Translator.t(STRING_NS, "retryConnectionBtn");
        const response = await vscode.window.showErrorMessage(errMsg, editBtn, retryBtn);
        if (response === editBtn) {
            // start again from the beginning (and this command instance will terminate after this function call exits)
            newConnectionCmd();
            return undefined;
        }
        else if (response === retryBtn) {
            // try to connect with the same host:port
            return await tryAddConnection(connInfo);
        }
        return undefined;
    }
}

/**
 * We've determined by this point that Microclimate is running at the given URI,
 * but we have to validate now that it's a new enough version.
 */
export async function onSuccessfulConnection(mcUri: vscode.Uri, host: string, mcEnvData: MCEnvironment.IMCEnvData): Promise<Connection> {
    Log.i("Microclimate ENV data:", mcEnvData);

    const rawVersion: string = mcEnvData.microclimate_version;
    const rawWorkspace: string = mcEnvData.workspace_location;

    Log.d("rawVersion from Microclimate is", rawVersion);
    Log.d("rawWorkspace from Microclimate is", rawWorkspace);
    if (rawVersion == null || rawWorkspace == null) {
        Log.e("Microclimate environment did not provide either version or workspace. Data provided is:", mcEnvData);
        throw new Error(Translator.t(STRING_NS, "versionNotProvided", { requiredVersion: MCEnvironment.REQUIRED_VERSION_STR }));
    }

    const versionNum = MCEnvironment.getVersionNumber(mcEnvData);

    try {
        return await ConnectionManager.instance.addConnection(mcUri, host, versionNum, rawWorkspace);
    }
    catch (err) {
        Log.i("New connection rejected by ConnectionManager ", err.message || err);
        throw err;
    }
}
