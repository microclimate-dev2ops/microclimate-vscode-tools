import * as vscode from "vscode";

import { Logger } from "../Logger";
import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import AppLog from "../microclimate/logs/AppLog";
import BuildLog from "../microclimate/logs/BuildLog";
import { ProjectState } from "../microclimate/project/ProjectState";

export default async function openLogCmd(project: Project, appLog: Boolean): Promise<void> {
    Logger.log("OpenLogCmd invoked");
    if (project == null) {
        const selected = await promptForProject(ProjectState.AppStates.STARTED);
        if (selected == null) {
            // user cancelled
            Logger.log("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    if (!project.type.providesBuildLog) {
        vscode.window.showErrorMessage(`Build logs are not available for ${project.type.userFriendlyType} projects.`);
        return;
    }

    // shouldn't happen anymore
    if (!project.state.isEnabled) {
        vscode.window.showErrorMessage("Logs are not available for Disabled projects.");
        return;
    }

    let log: AppLog | BuildLog;
    if (appLog) {
        log = AppLog.getOrCreateLog(project.id, project.name);
    }
    else {
        log = BuildLog.getOrCreateLog(project);
    }
    log.showOutputChannel();
}
