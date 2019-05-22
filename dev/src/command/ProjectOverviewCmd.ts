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

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import * as ProjectOverview from "../microclimate/project/ProjectOverviewPage";
import Log from "../Logger";
import Commands from "../constants/Commands";
import Requester from "../microclimate/project/Requester";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";
import toggleAutoBuildCmd from "./ToggleAutoBuildCmd";
import toggleEnablementCmd from "./ToggleEnablementCmd";
import requestBuildCmd from "./RequestBuildCmd";
import Resources from "../constants/Resources";
import * as MCUtil from "../MCUtil";

export default async function projectOverviewCmd(project: Project): Promise<void> {
    // Log.d("projectOverviewCmd invoked");
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
        localResourceRoots: [vscode.Uri.file(Resources.getBaseResourcePath())]
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
        // this will dispose the webview a second time, but that seems to be fine
        project.closeProjectInfo();
    });

    const icons = project.type.icon;
    webPanel.iconPath = {
        light: vscode.Uri.file(icons.light),
        dark:  vscode.Uri.file(icons.dark)
    };

    // const ed = vscode.window.activeTextEditor;
    webPanel.webview.html = ProjectOverview.generateHtml(project);
    webPanel.webview.onDidReceiveMessage(handleWebviewMessage.bind(project));
}

interface IWebViewMsg {
    type: string;
    data: {
        type: string;
        value: string;
    };
}

function handleWebviewMessage(this: Project, msg: IWebViewMsg): void {
    const project = this;
    // Log.d(`Got message from ProjectInfo for project ${project.name}: ${msg.type} data ${JSON.stringify(msg.data)}`);
    try {
        switch (msg.type) {
            case ProjectOverview.Messages.OPEN: {
                onRequestOpen(msg);
                break;
            }
            case ProjectOverview.Messages.TOGGLE_AUTOBUILD: {
                toggleAutoBuildCmd(project);
                break;
            }
            case ProjectOverview.Messages.TOGGLE_ENABLEMENT: {
                toggleEnablementCmd(project, !project.state.isEnabled);
                break;
            }
            case ProjectOverview.Messages.BUILD: {
                requestBuildCmd(project);
                break;
            }
            case ProjectOverview.Messages.DELETE: {
                onRequestDelete(project);
                break;
            }
            case ProjectOverview.Messages.EDIT: {
                onRequestEdit(msg.data.type as ProjectOverview.Editable, project);
                break;
            }
            default: {
                Log.e("Received unknown event from project info webview:", msg);
            }
        }
    }
    catch (err) {
        Log.e("Error processing msg from WebView", err);
    }
}

async function onRequestOpen(msg: IWebViewMsg): Promise<void> {
    Log.d("Got msg to open, data is ", msg.data);
    let uri: vscode.Uri;
    if (msg.data.type === ProjectOverview.Openable.FILE || msg.data.type === ProjectOverview.Openable.FOLDER) {
        uri = vscode.Uri.file(msg.data.value);
    }
    else {
        // default to web
        uri = vscode.Uri.parse(msg.data.value);
    }

    Log.i("The uri is:", uri);
    const cmd: string = msg.data.type === ProjectOverview.Openable.FOLDER ? Commands.VSC_REVEAL_IN_OS : Commands.VSC_OPEN;
    vscode.commands.executeCommand(cmd, uri);
}

async function onRequestDelete(project: Project): Promise<void> {
    const deleteMsg = Translator.t(StringNamespaces.CMD_MISC, "confirmDeleteProjectMsg", { projectName: project.name });
    const deleteBtn = Translator.t(StringNamespaces.CMD_MISC, "confirmDeleteBtn", { projectName: project.name });

    const response = await vscode.window.showWarningMessage(deleteMsg, { modal: true }, deleteBtn);
    if (response === deleteBtn) {
        // Delete the project, then close the webview since the project is gone.
        Requester.requestUnbind(project);
    }
}

async function onRequestEdit(type: ProjectOverview.Editable, project: Project): Promise<void> {
    // https://github.ibm.com/dev-ex/iterative-dev/wiki/File-watcher-External-APIs#post-apiv1projectsprojectidsettings
    let userFriendlySetting: string;
    let settingKey: string;
    let currentValue: OptionalString;
    switch (type) {
        case ProjectOverview.Editable.CONTEXT_ROOT: {
            userFriendlySetting = "application endpoint path";
            settingKey = "contextRoot";
            currentValue = project.contextRoot;
            if (currentValue.startsWith("/")) {
                currentValue = currentValue.substring(1, currentValue.length);
            }
            break;
        }
        case ProjectOverview.Editable.APP_PORT: {
            userFriendlySetting = "application port";
            settingKey = "internalPort";
            currentValue = project.ports.internalPort ? project.ports.internalPort.toString() : undefined;
            break;
        }
        case ProjectOverview.Editable.DEBUG_PORT: {
            userFriendlySetting = "debug port";
            settingKey = "internalDebugPort";
            currentValue = project.ports.internalDebugPort ? project.ports.internalDebugPort.toString() : undefined;
            break;
        }
        default: {
            Log.e("Unrecognized editable type: ", type);
            return;
        }
    }

    const options: vscode.InputBoxOptions = {
        prompt: `Enter a new ${userFriendlySetting} for ${project.name}`,
        value: currentValue,
        valueSelection: undefined,
    };

    const isPort: boolean = type === ProjectOverview.Editable.APP_PORT || type === ProjectOverview.Editable.DEBUG_PORT;

    if (isPort) {
        options.validateInput = (inputToValidate: string): OptionalString => {
            if (!MCUtil.isGoodPort(Number(inputToValidate))) {
                return Translator.t(StringNamespaces.CMD_NEW_CONNECTION, "invalidPortNumber", { port: inputToValidate });
            }
            return undefined;
        };
    }

    const input = await vscode.window.showInputBox(options);
    if (input == null) {
        return;
    }
    Log.i(`Requesting to change ${type} for ${project.name} to ${input}`);

    try {
        await Requester.requestSettingChange(project, userFriendlySetting, settingKey, input, isPort);
    }
    catch (err) {
        // requester will show the error
    }
}
