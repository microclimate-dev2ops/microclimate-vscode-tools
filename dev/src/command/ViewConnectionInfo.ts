/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import { promptForConnection } from "./CommandUtil";
import Log from "../Logger";
import { ICPConnection, Connection } from "../microclimate/connection/ConnectionExporter";
import Authenticator from "../microclimate/connection/auth/Authenticator";

// import Translator from "../constants/strings/translator";
// import StringNamespaces from "../constants/strings/StringNamespaces";

export default async function viewConnectionInfo(connection: Connection): Promise<void> {
    Log.d("viewConnectionInfo");
    if (connection == null) {
        const selected = await promptForConnection(false);
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        connection = selected;
    }

    let msg;
    if (connection.isICP()) {
        const icpConnection = connection as ICPConnection;

        msg = `ICP Connection ${icpConnection.mcUrl} ` +
            `Master Node: ${icpConnection.masterHost} ` +
            `Kube Namespace: ${icpConnection.kubeNamespace} ` +
            `Username: ${icpConnection.user} ` +
            `Authentication: ${getAuthStatus(icpConnection)} ` +
            `Workspace: ${icpConnection.workspacePath.fsPath}`;
    }
    else {
        msg = `Local connection ${connection.mcUrl} Workspace: ${connection.workspacePath.fsPath}`;
    }

    return vscode.window.showInformationMessage(msg).then(() => Promise.resolve());
}

function getAuthStatus(connection: ICPConnection): string {
    const tokenset = Authenticator.getTokensetFor(connection.mcUrl);
    if (tokenset == null) {
        return "Not authenticated";
    }
    else if (tokenset.expires_at > Date.now()) {
        return "Expires at " + new Date(tokenset.expires_at).toLocaleString();
    }
    return "Expired";
}
