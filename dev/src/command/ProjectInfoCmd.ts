import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import * as ProjectInfo from "../microclimate/project/ProjectInfo";
import Logger from "../Logger";
import Commands from "../constants/Commands";
import Requester from "../microclimate/project/Requester";

export default async function projectInfoCmd(project: Project): Promise<void> {
    Logger.log("viewProjectInfoCmd invoked");
    if (project == null) {
        const selected = await promptForProject();
        if (selected == null) {
            // user cancelled
            Logger.log("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    const wvOptions: vscode.WebviewOptions & vscode.WebviewPanelOptions = {
        enableScripts: true,
        retainContextWhenHidden: true,
        enableCommandUris: true
    };

    const webPanel = vscode.window.createWebviewPanel(project.name, project.name, vscode.ViewColumn.Active, wvOptions);
    const icons = project.type.icon;
    webPanel.iconPath = {
        light: vscode.Uri.file(icons.light),
        dark:  vscode.Uri.file(icons.dark)
    };

    // const ed = vscode.window.activeTextEditor;
    webPanel.webview.html = ProjectInfo.generateHtml(project);
    webPanel.webview.onDidReceiveMessage( (msg: { msg: string, data: { type: string, value: string } }) => {
        try {
            if (msg.msg === ProjectInfo.REFRESH_MSG) {
                // vscode.window.showInformationMessage("refreshed!!");
                webPanel.webview.html = ProjectInfo.generateHtml(project);
            }
            else if (msg.msg === ProjectInfo.TOGGLE_AUTOBUILD_MSG) {
                Requester.requestToggleAutoBuild(project);
            }
            else if (msg.msg === ProjectInfo.OPEN_MSG) {
                Logger.log("Got msg to open, data is ", msg.data);
                let uri: vscode.Uri;
                if (msg.data.type === ProjectInfo.Openable.FILE || msg.data.type === ProjectInfo.Openable.FOLDER) {
                    uri = vscode.Uri.file(msg.data.value);
                }
                else {
                    // default to web
                    uri = vscode.Uri.parse(msg.data.value);
                }

                Logger.log("The uri is:", uri);
                const cmd: string = msg.data.type === ProjectInfo.Openable.FOLDER ? Commands.VSC_REVEAL_IN_OS : Commands.VSC_OPEN;
                vscode.commands.executeCommand(cmd, uri);
            }
            else {
                Logger.logE("Received unknown event from project info webview:", msg);
            }
        }
        catch (err) {
            Logger.logE("Error processing msg from WebView", err);
        }
    });

    webPanel.reveal();
}