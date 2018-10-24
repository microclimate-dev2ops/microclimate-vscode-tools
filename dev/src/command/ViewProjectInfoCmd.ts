import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import projectInfoHtml from "../microclimate/project/ProjectInfo";
import { Logger } from "../Logger";

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

    // Could see if a matching WV is already open, and if so, just send it a refresh event instead.
    const webPanel = vscode.window.createWebviewPanel(project.name, project.name, vscode.ViewColumn.Active, wvOptions);
    const icons = project.type.icon;
    webPanel.iconPath = {
        light: vscode.Uri.file(icons.light),
        dark: vscode.Uri.file(icons.dark)
    };

    // const ed = vscode.window.activeTextEditor;
    webPanel.webview.html = projectInfoHtml(project);
    webPanel.reveal();
}