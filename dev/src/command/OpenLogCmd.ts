import * as vscode from "vscode";

import { Logger } from "../Logger";
import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import AppLog from "../microclimate/logs/AppLog";
import BuildLog from "../microclimate/logs/BuildLog";
import { ProjectState } from "../microclimate/project/ProjectState";

/**
 *
 * @param isAppLog - Indicates whether the user wants to open the App log or Build log.
 */
export default async function openLogCmd(project: Project, isAppLog: Boolean): Promise<void> {
    Logger.log("OpenLogCmd invoked");
    if (project == null) {
        const selected = await promptForProject();
        if (selected == null) {
            // user cancelled
            Logger.log("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    if (!isAppLog && !project.type.providesBuildLog) {
        vscode.window.showErrorMessage(`Build logs are not available for ${project.type.userFriendlyType} projects.`);
        return;
    }

    if (isAppLog && (project.state.appState === ProjectState.AppStates.STOPPED || !project.state.isEnabled)) {
        // If we were to create an app log for stopped or disabled project,
        // it would just say "waiting for Microclimate to send logs" until the app starts.
        vscode.window.showErrorMessage("App Logs are not available for Stopped or Disabled projects.");
        return;
    }

    let log: AppLog | BuildLog;
    if (isAppLog) {
        log = AppLog.getOrCreateLog(project.id, project.name);
    }
    else {
        log = BuildLog.getOrCreateLog(project);
    }
    log.showOutputChannel();
}
