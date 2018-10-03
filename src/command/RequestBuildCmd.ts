import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";

export default async function requestBuildCmd(project: Project): Promise<void> {
    console.log("RequestBuildCmd invoked");
    if (project == null) {
        const selected = await promptForProject(true);
        if (selected == null) {
            // user cancelled
            console.log("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    if (project.state.isBuilding) {
        vscode.window.showErrorMessage(`${project.name} is already building`);
        return;
    }

    console.log(`Request build for project ${project.name}`);

    project.connection.requestBuild(project);
}
