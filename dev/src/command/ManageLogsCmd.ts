/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

// import Translator from "../constants/strings/translator";
// import StringNamespaces from "../constants/strings/StringNamespaces";
import Log from "../Logger";
import Project from "../microclimate/project/Project";
import ProjectState from "../microclimate/project/ProjectState";
import { promptForProject } from "./CommandUtil";
import MCLog from "../microclimate/project/logs/MCLog";
import MCLogManagerOld from "../microclimate/project/logs/deprecated/MCLogManager-Old";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

// const STRING_NS = StringNamespaces.LOGS;

export async function showAllLogs(project: Project): Promise<void> {
    return manageLogsInner(project, "show");
}

export async function hideAllLogs(project: Project): Promise<void> {
    return manageLogsInner(project, "hide");
}

export async function manageLogs(project: Project): Promise<void> {
    return manageLogsInner(project);
}

async function manageLogsInner(project: Project, all?: "show" | "hide"): Promise<void> {
    if (project == null) {
        const selected = await promptForProject(...ProjectState.getEnabledStates());
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    if (project.logManager instanceof MCLogManagerOld) {
        // We have to use the deprecated API
        return manageLogsDeprecated(project, all);
    }

    // Wait for the logmanager to initialize, just in case it hasn't finished yet
    await project.logManager.initPromise;
    const logs = project.logManager.logs;

    if (logs.length === 0) {
        vscode.window.showWarningMessage("This project does not have any logs available at this time.");
        return;
    }

    if (all === "show") {
        Log.d("Showing all logs for " + project.name);
        project.logManager.logs.forEach((log) => log.showOutput());
        await project.logManager.toggleLogStreaming(true);
        return;
    }
    else if (all === "hide") {
        Log.d("Hiding all logs for " + project.name);
        project.logManager.logs.forEach((log) => log.removeOutput());
        await project.logManager.toggleLogStreaming(false);
        return;
    }

    const options: vscode.QuickPickOptions = {
        canPickMany: true,
        placeHolder: "Select the logs you wish to see in the Output view"
    };

    // https://github.com/Microsoft/vscode/issues/64014
    const logsToShow: MCLog[] | undefined = await vscode.window.showQuickPick<MCLog>(logs, options) as (MCLog[] | undefined);
    if (logsToShow != null) {
        // Log.d("selection", selection);

        logs.forEach((log) => {
            if (logsToShow.includes(log)) {
                log.showOutput();
            }
            else {
                log.removeOutput();
            }
        });

        // stop the stream if 0 logs are to be shown,
        // or restart the stream if at least one is to be shown (in case one of the ones to be shown is a new one)
        await project.logManager.toggleLogStreaming(logsToShow.length !== 0);
    }
}

const STRING_NS = StringNamespaces.CMD_OPEN_LOG;
// can't wait to delete this!
async function manageLogsDeprecated(project: Project, all?: "show" | "hide"): Promise<void> {

    const options: vscode.QuickPickOptions = {
        canPickMany: true
    };

    const appLogName = "Application log";
    const buildLogName = "Build log";
    const logsAvailable: vscode.QuickPickItem[] = [ { label: appLogName }, { label: buildLogName } ];

    let toShow: string[];
    if (all === "show") {
        toShow = [ appLogName, buildLogName ];
    }
    else if (all === "hide") {
        toShow = [];
    }
    else {
        const logsSelected = await vscode.window.showQuickPick(logsAvailable, options) as (vscode.QuickPickItem[] | undefined);
        if (logsSelected == null) {
            // cancelled
            return;
        }
        toShow = logsSelected.map((qpi) => qpi.label);
    }

    const logManager = project.logManager as MCLogManagerOld;
    if (toShow.includes(appLogName)) {
        if (!project.state.isEnabled) {
            // If we were to create an app log for a disabled project,
            // it would just say "waiting for Microclimate to send logs" until the app starts.
            vscode.window.showErrorMessage(Translator.t(STRING_NS, "noLogsForDisabled"));
        }
        else {
            if (!project.state.isStarted) {
                vscode.window.showWarningMessage(Translator.t(STRING_NS, "projectIsNotStarted",
                    { projectName: project.name, projectState: project.state.appState })
                );
            }
            logManager.getOrCreateAppLog(project.id, project.name).showOutputChannel();
        }
    }
    else {
        const existingAppLog = logManager.getAppLog(project.id);
        if (existingAppLog != null) {
            existingAppLog.destroy();
        }
    }

    if (toShow.includes(buildLogName)) {
        if (!project.type.providesBuildLog) {
            vscode.window.showErrorMessage(Translator.t(STRING_NS, "noBuildLogsForType", { projectType: project.type.type }));
        }
        else {
            logManager.getOrCreateBuildLog(project.id, project.name).showOutputChannel();
        }
    }
    else {
        const existingBuildLog = logManager.getBuildLog(project.id);
        if (existingBuildLog != null) {
            existingBuildLog.destroy();
        }
    }
}
