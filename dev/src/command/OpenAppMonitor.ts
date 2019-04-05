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

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import Log from "../Logger";
import Commands from "../constants/Commands";
import EndpointUtil from "../constants/Endpoints";
import Requester from "../microclimate/project/Requester";

export default async function openAppMonitorCmd(project: Project): Promise<void> {
    Log.d("openAppMonitorCmd invoked");
    if (project == null) {
        const selected = await promptForProject();
        if (selected == null) {
            Log.d("User cancelled prompt for resource");
            // user cancelled
            return;
        }
        project = selected;
    }

    let supported: boolean;
    if (!project.connection.is1905OrNewer()) {
        // The 'metrics available' API was added in 1905 too
        // if the API is not there, we must assume metrics are supported.
        supported = true;
    }
    else {
        supported = await Requester.areMetricsAvailable(project);
    }

    // Log.d(`${project.name} supports metrics ? ${supported}`);
    if (!supported) {
        vscode.window.showWarningMessage(`${project.name} does not support application metrics.`);
        return;
    }

    const monitorPageUrl: vscode.Uri = EndpointUtil.resolveAppMonitorUrl(project.connection, project.id);
    Log.i("Open monitor at " + monitorPageUrl);
    vscode.commands.executeCommand(Commands.VSC_OPEN, monitorPageUrl);
}
