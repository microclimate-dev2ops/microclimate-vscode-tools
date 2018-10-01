import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { ProjectState } from "../microclimate/project/ProjectState";

export default async function restartProjectCmd(project: Project, debug: Boolean): Promise<void> {
    if (project == null) {
        // this means it was invoked from the command palette, not from the TreeItem
        // some extra work to support this - need user to enter project name, 
        // then find the ONE project that matches that name - See ConnectionManager.getProjectByName
        // TODO Getting the Project in this way could apply to many commands.
        vscode.window.showErrorMessage("Not implemented - Use the Project Tree context menu");
        return;
    }

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

    vscode.window.showInformationMessage("Restarting " + project.name);
    await project.connection.requestProjectRestart(project.id, debug);
}
