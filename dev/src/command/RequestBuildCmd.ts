import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import Log from "../Logger";
import Requester from "../microclimate/project/Requester";

export default async function requestBuildCmd(project: Project): Promise<void> {
    Log.i("RequestBuildCmd invoked");
    if (project == null) {
        const selected = await promptForProject();
        if (selected == null) {
            // user cancelled
            Log.i("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    if (project.state.isBuilding) {
        vscode.window.showErrorMessage(`${project.name} is already building`);
        return;
    }

    Log.i(`Request build for project ${project.name}`);

    Requester.requestBuild(project);
}
