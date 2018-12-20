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
import * as ProjectInfo from "../microclimate/project/ProjectOverview";
import Log from "../Logger";
import Commands from "../constants/Commands";
import Requester from "../microclimate/project/Requester";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";
import toggleAutoBuildCmd from "./ToggleAutoBuildCmd";
import toggleEnablementCmd from "./ToggleEnablementCmd";
import requestBuildCmd from "./RequestBuildCmd";

export default async function projectOverviewCmd(project: Project): Promise<void> {
    Log.d("projectOverviewCmd invoked");
    if (project == null) {
        const selected = await promptForProject();
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    const wvOptions: vscode.WebviewOptions & vscode.WebviewPanelOptions = {
        enableScripts: true,
        retainContextWhenHidden: true,

    };

    const webPanel = vscode.window.createWebviewPanel(project.name, project.name, vscode.ViewColumn.Active, wvOptions);

    const existingPI = project.onOpenProjectInfo(webPanel);
    if (existingPI != null) {
        // Just focus them on the existing one, and do nothing more.
        existingPI.reveal();
        webPanel.dispose();
        return;
    }

    webPanel.reveal();
    webPanel.onDidDispose( () => {
        project.onCloseProjectInfo();
    });

    const icons = project.type.icon;
    webPanel.iconPath = {
        light: vscode.Uri.file(icons.light),
        dark:  vscode.Uri.file(icons.dark)
    };

    // const ed = vscode.window.activeTextEditor;
    webPanel.webview.html = ProjectInfo.generateHtml(project);
    webPanel.webview.onDidReceiveMessage( (msg: { type: string, data: { type: string, value: string } }) => {
        Log.d(`Got message from ProjectInfo for project ${project.name}: ${msg.type}`);
        try {
            if (msg.type === ProjectInfo.Messages.TOGGLE_AUTOBUILD) {
                toggleAutoBuildCmd(project);
            }
            else if (msg.type === ProjectInfo.Messages.TOGGLE_ENABLEMENT) {
                toggleEnablementCmd(project, !project.state.isEnabled);
            }
            else if (msg.type === ProjectInfo.Messages.BUILD) {
                requestBuildCmd(project);
            }
            else if (msg.type === ProjectInfo.Messages.DELETE) {

                const deleteMsg = Translator.t(StringNamespaces.CMD_MISC, "confirmDeleteProjectMsg", { projectName: project.name });
                const deleteBtn = Translator.t(StringNamespaces.CMD_MISC, "confirmDeleteBtn", { projectName: project.name });

                vscode.window.showWarningMessage(deleteMsg, { modal: true }, deleteBtn)
                    .then( (response) => {
                        if (response === deleteBtn) {
                            // Delete the project, then close the webview since the project is gone.
                            Requester.requestDelete(project)
                                .then ( () => webPanel.dispose());
                        }
                    });
            }
            else if (msg.type === ProjectInfo.Messages.OPEN) {
                Log.d("Got msg to open, data is ", msg.data);
                let uri: vscode.Uri;
                if (msg.data.type === ProjectInfo.Openable.FILE || msg.data.type === ProjectInfo.Openable.FOLDER) {
                    uri = vscode.Uri.file(msg.data.value);
                }
                else {
                    // default to web
                    uri = vscode.Uri.parse(msg.data.value);
                }

                Log.i("The uri is:", uri);
                const cmd: string = msg.data.type === ProjectInfo.Openable.FOLDER ? Commands.VSC_REVEAL_IN_OS : Commands.VSC_OPEN;
                vscode.commands.executeCommand(cmd, uri);
            }
            else {
                Log.e("Received unknown event from project info webview:", msg);
            }
        }
        catch (err) {
            Log.e("Error processing msg from WebView", err);
        }
    });
}
