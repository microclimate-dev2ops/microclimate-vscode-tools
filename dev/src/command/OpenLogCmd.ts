import * as vscode from "vscode";

import Log from "../Logger";
import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import ProjectState from "../microclimate/project/ProjectState";
import MCLog from "../microclimate/logs/MCLog";

/**
 *
 * @param isAppLog - Indicates whether the user wants to open the App log or Build log.
 */
export default async function openLogCmd(project: Project, isAppLog: boolean): Promise<void> {
    Log.d("OpenLogCmd invoked");
    if (project == null) {
        const selected = await promptForProject();
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    let log: MCLog;
    if (isAppLog) {
        if (!project.state.isEnabled) {
            // If we were to create an app log for a disabled project,
            // it would just say "waiting for Microclimate to send logs" until the app starts.
            vscode.window.showErrorMessage("App Logs are not available for Disabled projects.");
            return;
        }
        else if (project.state.appState === ProjectState.AppStates.STOPPED) {
            vscode.window.showWarningMessage(`${project.name} is ${ProjectState.AppStates.STOPPED};` +
                ` it might not have any app log output until it starts.`);
        }

        log = project.connection.logManager.getOrCreateAppLog(project.id, project.name);
    }
    else {
        if (!project.type.providesBuildLog) {
            vscode.window.showErrorMessage(`Build logs are not available for ${project.type} projects.`);
            return;
        }

        log = project.connection.logManager.getOrCreateBuildLog(project.id, project.name);
    }
    log.showOutputChannel();
}
