import * as vscode from "vscode";

import Project from "microclimate/project/Project";
import { promptForProject } from "command/CommandUtil";
import AppLog from "microclimate/logs/AppLog";
import { ProjectState } from "microclimate/project/ProjectState";

export default async function openAppLogCmd(project: Project): Promise<void> {
    console.log("OpenBuildLogCmd invoked");
    if (project == null) {
        const selected = await promptForProject(ProjectState.AppStates.STARTED);
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
