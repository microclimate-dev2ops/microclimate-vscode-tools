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
import Connection from "../microclimate/connection/Connection";
import Authenticator from "../microclimate/connection/auth/Authenticator";

// import Translator from "../constants/strings/translator";
// import StringNamespaces from "../constants/strings/StringNamespaces";

export default async function viewConnectionInfo(connection: Connection): Promise<void> {
    Log.d("viewConnectionInfo");
    if (connection == null) {
        const selected = await promptForConnection(true);
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        connection = selected;
    }

    const username = connection.user || "N/A";
    const authStatus = getAuthStatus(connection);

    const msg = `Connection ${connection.mcUrl}\n` +
        `Username: ${username}\n` +
        `Authentication: ${authStatus}\n%n` +
        `Workspace: ${connection.workspacePath.fsPath}`;

    return vscode.window.showInformationMessage(msg).then(() => Promise.resolve());
}

function getAuthStatus(connection: Connection): string {
    if (!connection.isICP) {
        return "N/A";
    }

    const tokenset = Authenticator.getTokensetForUrl(connection.mcUrl);
    if (tokenset == null) {
        return "Not authenticated";
    }
    else if (tokenset.expires_at > Date.now()) {
        return "Expires at " + new Date(tokenset.expires_at).toLocaleString();
    }
    return "Expired";
}
