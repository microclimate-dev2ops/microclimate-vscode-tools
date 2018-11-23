import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "../command/CommandUtil";
import ProjectState from "../microclimate/project/ProjectState";
import Log from "../Logger";
import StartModes, { getDefaultStartMode, isDebugMode, getUserFriendlyStartMode } from "../constants/StartModes";
import Requester from "../microclimate/project/Requester";
import * as MCUtil from "../MCUtil";
import attachDebuggerCmd from "./AttachDebuggerCmd";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

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
                onRestartAccepted(project, startMode);
                return true;
            }
            return false;
    });
}

async function onRestartAccepted(project: Project, startMode: StartModes): Promise<void> {
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

    const isDebug = isDebugMode(startMode);

    let restartSuccess = false;
    if (isDebug) {
        Log.d("Attaching debugger after restart");
        try {
            // will wait for Starting
            restartSuccess = await attachDebuggerCmd(project);
        }
        catch (err) {
            // Most errors should be handled by attachDebuggerCmd
            Log.w("Debugger attach failed or was cancelled by user", err);
            vscode.window.showWarningMessage(err);
        }
    }

    // Expect the project to restart into this state
    try {
        const terminalState = isDebug ? ProjectState.AppStates.DEBUGGING : ProjectState.AppStates.STARTED;
        Log.d(`Waiting for terminal state ${terminalState} after restart`);
        const state = await project.waitForState(120 * 1000, terminalState);
        restartSuccess = state === terminalState;
    }
    catch (err) {
        Log.w("Run-mode restart did not complete in time, or was cancelled by user:", err);
        vscode.window.showWarningMessage(err);
    }

    if (restartSuccess) {
        const doneRestartMsg = Translator.t(StringNamespaces.DEFAULT, "restartSuccess",
            { projectName: project.name, startMode: getUserFriendlyStartMode(startMode) }
        );
        Log.i(doneRestartMsg);
        vscode.window.showInformationMessage(doneRestartMsg);
    }
    else {
        // Either the restart failed, or the user cancelled it by initiating another restart
        const msg = Translator.t(StringNamespaces.DEFAULT, "restartFailure",
            { projectName: project.name, startMode: getUserFriendlyStartMode(startMode) }
        );
        Log.w(msg);
        // TODO show this warning or not?
        vscode.window.showWarningMessage(msg);
    }
}
