import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import AppLog from "../microclimate/logs/AppLog";

export default async function openAppLogCmd(project: Project): Promise<void> {
    console.log("OpenBuildLogCmd invoked");
    if (project == null) {
        const selected = await promptForProject(true);
        if (selected == null) {
            // user cancelled
            console.log("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    if (!project.state.isEnabled) {
        vscode.window.showErrorMessage("App logs are not available for Disabled projects.");
        return;
    }

    const appLogOutput = AppLog.getOrCreateLog(project.id, project.name);
    console.log(`Open app log for project with name ${project.name} id ${project.id}`);
    appLogOutput.showOutputChannel();
}
