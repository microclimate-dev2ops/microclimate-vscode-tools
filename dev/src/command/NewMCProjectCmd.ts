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

import { promptForConnection } from "./CommandUtil";
import Log from "../Logger";
import Commands from "../constants/Commands";
import Connection from "../microclimate/connection/Connection";
import Endpoints from "../constants/Endpoints";

export default async function newMCProjectCmd(connection: Connection): Promise<void> {
    Log.d("newMCProjectCmd invoked");
    if (connection == null) {
        const selected = await promptForConnection(true);
        if (selected == null) {
            Log.d("User cancelled prompt for resource");
            // user cancelled
            return;
        }
        connection = selected;
    }

    const newProjectUrl = Endpoints.getProjectCreationUrl(connection);
    Log.i("Create new Microclimate project at " + newProjectUrl);
    vscode.commands.executeCommand(Commands.VSC_OPEN, newProjectUrl);
}
