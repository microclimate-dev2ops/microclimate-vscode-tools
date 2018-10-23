import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import { Logger } from "../Logger";

export default async function openBuildLogCmd(project: Project): Promise<void> {
    Logger.log("OpenBuildLogCmd invoked");
    if (project == null) {
        const selected = await promptForProject();
        if (selected == null) {
            // user cancelled
            Logger.log("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    if (!project.type.providesBuildLog) {
        vscode.window.showWarningMessage(`${project.type.userFriendlyType} projects do not have build logs.`);
        return;
    }
    else if (!project.state.isEnabled) {
        vscode.window.showWarningMessage("Build logs are not available for Disabled projects.");
        return;
    }
    else if (!project.buildLogPath) {
        vscode.window.showErrorMessage(`Failed to get build logs for ${project.name}.`);
        return;
    }

    Logger.log("Open Build Log for log path " + project.buildLogPath);

    vscode.commands.executeCommand("vscode.open", project.buildLogPath);
}
