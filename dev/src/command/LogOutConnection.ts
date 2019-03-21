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

// import * as vscode from "vscode";

import { promptForConnection } from "./CommandUtil";
import Log from "../Logger";
import { ICPConnection } from "../microclimate/connection/ConnectionExporter";
// import Translator from "../constants/strings/translator";
// import StringNamespaces from "../constants/strings/StringNamespaces";

export default async function logOutConnection(connection: ICPConnection): Promise<void> {
    Log.d("logOutConnection");
    if (connection == null) {
        const selected = await promptForConnection(true, true);
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        connection = selected as ICPConnection;
    }

    return connection.logout();

    /*
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title: `Logging out of ${connection.mcUrl}...`
        }, (_progress, _token) => {
            return Authenticator.logout(connection);
        });
        const logoutMsg = `Logged out of ${connection.mcUrl}\nUse "Refresh Connection" to log back in.`;
        vscode.window.showInformationMessage(logoutMsg);
        connection.onDisconnect();
    }
    catch (err) {
        if (err instanceof requestErrors.StatusCodeError) {
            // make err point to the JSON error response instead of the overall Error object
            err = err.error;
        }
        Log.e("Error logging out", err);
        const errMsg = MCUtil.errToString(err, true);
        vscode.window.showErrorMessage("Error logging out: " + errMsg);
    }*/
}
