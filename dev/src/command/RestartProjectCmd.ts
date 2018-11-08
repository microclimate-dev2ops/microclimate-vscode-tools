import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "../command/CommandUtil";
import ProjectState from "../microclimate/project/ProjectState";
import * as Resources from "../constants/Resources";
import Log from "../Logger";
import StartModes, { getDefaultStartMode } from "../constants/StartModes";
import Requester from "../microclimate/project/Requester";

export default async function restartProjectCmd(project: Project, debug: Boolean): Promise<void> {
    Log.d("RestartProjectCmd invoked");
    if (project == null) {
        const selected = await promptForProject(ProjectState.AppStates.STARTED, ProjectState.AppStates.STARTING);
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    const startMode: StartModes = getDefaultStartMode(debug, project.type.type);

    Log.i(`RestartProject on project ${project.name} into ${startMode} mode`);

    const restartRequestPromise = Requester.requestProjectRestart(project, startMode);
    const syncIcon: string = Resources.getOcticon(Resources.Octicons.sync, true);
    vscode.window.setStatusBarMessage(`${syncIcon} Initiating restarting ${project.name}`, restartRequestPromise);
    return restartRequestPromise;
    // After the above async REST request, we don't do anything further for this command until
    // the Socket receives a projectRestartResult event.
    // see MCSocket.onProjectRestarted
}