import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForResource, promptForProject } from "./CommandUtil";

export default async function restartProjectCmd(project: Project, debug: Boolean): Promise<void> {
    console.log("RestartProjectCmd invoked");
    if (project == null) {
        const selected = await promptForProject(true);
        if (selected == null) {
            // user cancelled
            console.log("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    // TODO validate this project has the restart capability using the caps endpoint
    if (!project.isStarted) {
        vscode.window.showErrorMessage("You can only restart projects that are already Started");
        return;
    }
    // TODO
    else if (debug) {
        vscode.window.showErrorMessage("Debug isn't implemented yet");
        return;
    }

    console.log(`RestartProject on project ${project.name} into debug mode? ${debug}`);

    await project.connection.requestProjectRestart(project, debug);
}
