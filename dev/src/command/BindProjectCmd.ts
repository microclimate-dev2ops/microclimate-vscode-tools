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
import * as MCUtil from "../MCUtil";
import UserProjectCreator from "../microclimate/connection/UserProjectCreator";

/**
 * @param create true for Create page, false for Import page
 */
export default async function bindProject(connection: Connection): Promise<void> {
    if (connection == null) {
        const selected = await promptForConnection(true);
        if (selected == null) {
            Log.d("User cancelled prompt for resource");
            // user cancelled
            return;
        }
        connection = selected;
    }

    try {
        const response = await UserProjectCreator.bindProject(connection);
        if (response == null) {
            return;
        }
        vscode.window.showInformationMessage(`Adding ${response.projectName} from ${response.locOnDisk}`);
    }
    catch (err) {
        const errMsg = "Error binding project: ";
        Log.e(errMsg, err);
        vscode.window.showErrorMessage(errMsg + MCUtil.errToString(err));
    }
}
