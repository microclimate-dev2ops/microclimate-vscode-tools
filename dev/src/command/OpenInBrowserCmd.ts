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
import Connection from "../microclimate/connection/Connection";
import { promptForResource } from "./CommandUtil";
import { ProjectState } from "../microclimate/project/ProjectState";
import { Log } from "../Logger";
import Commands from "../constants/Commands";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

const STRING_NS = StringNamespaces.CMD_OPEN_IN_BROWSER;

export default async function openInBrowserCmd(resource: Project | Connection): Promise<void> {
    Log.d("OpenInBrowserCmd invoked");
    if (resource == null) {
        const selected = await promptForResource(true, ProjectState.AppStates.STARTED);
        if (selected == null) {
            Log.d("User cancelled prompt for resource");
            // user cancelled
            return;
        }
        resource = selected;
    }

    let uriToOpen: vscode.Uri;
    // This will open the project or Microclimate in the external web browser.
    if (resource instanceof Project) {
        const project: Project = resource as Project;
        if (!project.state.isStarted) {
            vscode.window.showWarningMessage(Translator.t(STRING_NS, "canOnlyOpenStartedProjects"));
            return;
        }
        else if (project.appBaseUrl == null) {
            Log.e("Project is started but has no appBaseUrl: " + project.name);
            vscode.window.showErrorMessage(Translator.t(STRING_NS, "failedDetermineAppUrl", { projectName: project.name }));
            return;
        }
        uriToOpen = project.appBaseUrl;
    }
    else if (resource instanceof Connection) {
        const conn: Connection = resource as Connection;
        if (!conn.isConnected) {
            vscode.window.showErrorMessage(Translator.t(STRING_NS, "cantOpenDisconnected"));
            return;
        }
        uriToOpen = conn.mcUri;
    }
    else {
        // should never happen
        Log.e(`Don't know how to open object of type ${typeof(resource)} in browser`, resource);
        return;
    }

    Log.i("Open in browser: " + uriToOpen);
    // vscode.window.showInformationMessage("Opening " + uriToOpen);
    vscode.commands.executeCommand(Commands.VSC_OPEN, uriToOpen);
}
