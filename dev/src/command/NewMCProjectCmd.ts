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

import { promptForConnection } from "./CommandUtil";
import Log from "../Logger";
import Commands from "../constants/Commands";
import Connection from "../microclimate/connection/Connection";
import EndpointUtil from "../constants/Endpoints";
import * as MCUtil from "../MCUtil";
import ProjectCreator from "../microclimate/connection/ProjectCreator";


/**
 * @param create true for Create page, false for Import page
 */
export default async function openCreateOrImportPage(connection: Connection, create: boolean): Promise<void> {
    Log.d("openCreateOrImportPage invoked, create=" + create);
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
        if (create && connection.is1905OrNewer()) {
            await ProjectCreator.createProject(connection);
        }
        else {
            await deprecatedNewProject(connection, create);
        }
    }
    catch (err) {
        Log.e("Error importing project", err);
        const errMsg = MCUtil.errToString(err);
        vscode.window.showErrorMessage("Error importing project: " + errMsg);
    }
}

async function deprecatedNewProject(connection: Connection, create: boolean): Promise<void> {
    const newProjectUrl = EndpointUtil.resolveCreateOrImportUrl(connection, create);
    Log.i(`${create ? "Create" : "Import"} new Microclimate project at ${newProjectUrl}`);
    return vscode.commands.executeCommand(Commands.VSC_OPEN, newProjectUrl);
}
