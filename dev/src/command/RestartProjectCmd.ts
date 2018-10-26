import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "../command/CommandUtil";
import { ProjectState } from "../microclimate/project/ProjectState";
import AppLog from "../microclimate/logs/AppLog";
import { getStartMode } from "../MCUtil";
import { getOcticon, Octicons } from "../constants/Resources";
import { Logger } from "../Logger";
import Connection from "../microclimate/connection/Connection";

export default async function restartProjectCmd(project: Project, debug: Boolean): Promise<void> {
    Logger.log("RestartProjectCmd invoked");
    if (project == null) {
        const selected = await promptForProject(ProjectState.AppStates.STARTED, ProjectState.AppStates.STARTING);
        if (selected == null) {
            // user cancelled
            Logger.log("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    AppLog.getOrCreateLog(project.id, project.name).unsetDebugConsole();
    Logger.log(`RestartProject on project ${project.name} into ${getStartMode(debug)} mode`);

    const restartRequestPromise = Connection.requestProjectRestart(project, debug);
    vscode.window.setStatusBarMessage(`${getOcticon(Octicons.sync, true)} Initiating restarting ${project.name}`, restartRequestPromise);
    // After the above async REST request, we don't do anything further for this command until
    // the Socket receives a projectRestartResult event.
    // see MCSocket.onProjectRestarted
}