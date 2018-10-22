import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "../command/CommandUtil";
import { ProjectState } from "../microclimate/project/ProjectState";
import AppLog from "../microclimate/logs/AppLog";
import { getStartMode } from "../MCUtil";
import { getOcticon, Octicons } from "../constants/Icons";

export default async function restartProjectCmd(project: Project, debug: Boolean): Promise<void> {
    console.log("RestartProjectCmd invoked");
    if (project == null) {
        const selected = await promptForProject(ProjectState.AppStates.STARTED, ProjectState.AppStates.STARTING);
        if (selected == null) {
            // user cancelled
            console.log("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    AppLog.getOrCreateLog(project.id, project.name).unsetDebugConsole();
    console.log(`RestartProject on project ${project.name} into ${getStartMode(debug)} mode`);

    const restartRequestPromise = project.connection.requestProjectRestart(project, debug);
    vscode.window.setStatusBarMessage(`${getOcticon(Octicons.sync, true)} Initiating restarting ${project.name}`, restartRequestPromise);
    // After the above async REST request, we don't do anything further for this command until
    // the Socket receives a projectRestartResult event, which will then call the methods below.
    // see MCSocket.onProjectRestarted
}