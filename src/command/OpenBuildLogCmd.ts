import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";

export default async function openBuildLogCmd(project: Project): Promise<void> {
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
        vscode.window.showErrorMessage("Build logs are not available for Disabled projects.");
        return;
    }
    else if (!project.buildLogPath) {
        vscode.window.showErrorMessage(`Failed to get build logs for ${project.name}.`);
        return;
    }

    console.log("Open Build Log for log path " + project.buildLogPath);

    vscode.commands.executeCommand("vscode.open", project.buildLogPath);
}
