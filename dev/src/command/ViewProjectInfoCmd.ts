import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import * as ProjectInfo from "../microclimate/project/ProjectInfo";
import { Logger } from "../Logger";
import Connection from "../microclimate/connection/Connection";

export default async function viewProjectInfoCmd(project: Project): Promise<void> {
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

    // TODO if a matching WV is already open, and if so, just send it a refresh event instead.
    const webPanel = vscode.window.createWebviewPanel(project.name, project.name, vscode.ViewColumn.Active, wvOptions);
    const icons = project.type.icon;
    webPanel.iconPath = {
        light: vscode.Uri.file(icons.light),
        dark: vscode.Uri.file(icons.dark)
    };

    // const ed = vscode.window.activeTextEditor;
    webPanel.webview.html = ProjectInfo.generateHtml(project);
    webPanel.webview.onDidReceiveMessage( (msg: any) => {
        // console.log("Got msg from webview", msg);
        if (msg === ProjectInfo.REFRESH_MSG) {
            webPanel.webview.html = ProjectInfo.generateHtml(project);
        }
        else if (msg === ProjectInfo.TOGGLE_AUTOBUILD_MSG) {
            Connection.requestToggleAutoBuild(project);
        }
        else {
            Logger.logE("Received unknown event from project info webview:", msg);
        }
    });

    webPanel.reveal();
}