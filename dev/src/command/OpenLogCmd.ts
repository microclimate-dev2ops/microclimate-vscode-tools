import * as vscode from "vscode";

import Log from "../Logger";
import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import ProjectState from "../microclimate/project/ProjectState";
import MCLog from "../microclimate/logs/MCLog";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

const STRING_NS = StringNamespaces.CMD_OPEN_LOG;

/**
 *
 * @param isAppLog - Indicates whether the user wants to open the App log or Build log.
 */
export default async function openLogCmd(project: Project, isAppLog: boolean): Promise<void> {
    Log.d("OpenLogCmd invoked");
    if (project == null) {
        const selected = await promptForProject(...ProjectState.getEnabledStates());
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
            vscode.window.showErrorMessage(Translator.t(STRING_NS, "noLogsForDisabled"));
            return;
        }
        else if (!project.state.isStarted) {
            vscode.window.showWarningMessage(Translator.t(STRING_NS, "projectIsNotStarted",
                { projectName: project.name, projectState: project.state.appState })
            );
        }

        log = project.connection.logManager.getOrCreateAppLog(project.id, project.name);
    }
    else {
        if (!project.type.providesBuildLog) {
            vscode.window.showErrorMessage(Translator.t(STRING_NS, "noBuildLogsForType", { projectType: project.type.type }));
            return;
        }

        log = project.connection.logManager.getOrCreateBuildLog(project.id, project.name);
    }
    log.showOutputChannel();
}
