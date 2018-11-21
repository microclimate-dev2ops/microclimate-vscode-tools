import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import * as ProjectInfo from "../microclimate/project/ProjectInfo";
import Log from "../Logger";
import Commands from "../constants/Commands";
import Requester from "../microclimate/project/Requester";

export default async function projectInfoCmd(project: Project): Promise<void> {
    Log.d("viewProjectInfoCmd invoked");
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
                Log.d("Refresh projectInfo for project " + project.name);
                webPanel.webview.html = ProjectInfo.generateHtml(project);
            }
            else if (msg.msg === ProjectInfo.TOGGLE_AUTOBUILD_MSG) {
                Log.d("Got msg to toggle autobuild for project " + project.name);
                Requester.requestToggleAutoBuild(project);
            }
            else if (msg.msg === ProjectInfo.DELETE_MSG) {
                Log.d("Got msg to delete for project " + project.name);

                const deleteOption = `Confirm delete ${project.name} in Microclimate`;
                const options = [ "Cancel", deleteOption ];

                vscode.window.showQuickPick(options, { canPickMany: false })
                    .then( (response) => {
                        if (response === deleteOption) {
                            Requester.requestDelete(project);
                        }
                    });
            }
            else if (msg.msg === ProjectInfo.OPEN_MSG) {
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

    webPanel.reveal();
}
