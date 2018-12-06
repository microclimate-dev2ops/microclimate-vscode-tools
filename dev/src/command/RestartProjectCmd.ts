/*******************************************************************************
 * Copyright (c) 2018 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/


import Project from "../microclimate/project/Project";
import { promptForProject } from "../command/CommandUtil";
import ProjectState from "../microclimate/project/ProjectState";
import Log from "../Logger";
import StartModes, { getDefaultStartMode } from "../constants/StartModes";
import Requester from "../microclimate/project/Requester";
import * as MCUtil from "../MCUtil";

export default async function restartProjectCmd(project: Project, debug: boolean): Promise<boolean> {
    Log.d("RestartProjectCmd invoked");
    if (project == null) {
        const selected = await promptForProject(ProjectState.AppStates.STARTED, ProjectState.AppStates.STARTING);
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return false;
        }
        project = selected;
    }

    const startMode: StartModes = getDefaultStartMode(debug, project.type.type);

    Log.i(`RestartProject on project ${project.name} into ${startMode} mode`);

    return Requester.requestProjectRestart(project, startMode)
        .then( async (result) => {
            const statusCode = Number((await result).statusCode);

            // Note here that we don't return whether or not the restart actually suceeded,
            // just whether or not it was accepted by the server and therefore initiated.
            if (MCUtil.isGoodStatusCode(statusCode)) {
                Log.d("Restart was accepted by server");
                onRestartAccepted(project);
                return true;
            }
            return false;
    });
}

async function onRestartAccepted(project: Project): Promise<void> {
    // first, expect the app to Stop
    try {
        await project.waitForState(60 * 1000, ProjectState.AppStates.STOPPED);
    }
    catch (err) {
        Log.e(`Project ${project.name} didn't stop after restart request!`);
        return;
    }

    // open the app's logs so we can watch the restart execute
    project.connection.logManager.getOrCreateAppLog(project.id, project.name).showOutputChannel();

    // The rest of the restart will proceed once the restart result event is received by the MCSocket.
    // See MCSocket.onProjectRestarted
}
