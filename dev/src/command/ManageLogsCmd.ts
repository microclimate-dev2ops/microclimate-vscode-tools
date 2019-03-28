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

import * as vscode from "vscode";

// import Translator from "../constants/strings/translator";
// import StringNamespaces from "../constants/strings/StringNamespaces";
import Log from "../Logger";
import Project from "../microclimate/project/Project";
import ProjectState from "../microclimate/project/ProjectState";
import { promptForProject } from "./CommandUtil";
import MCLog from "../microclimate/project/logs/MCLog";

// const STRING_NS = StringNamespaces.LOGS;

export default async function manageLogsCmd(project: Project): Promise<void> {
    if (project == null) {
        const selected = await promptForProject(...ProjectState.getEnabledStates());
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    // Wait for the logmanager to initialize, just in case it hasn't finished yet
    await project.logManager.initPromise;
    const logs = project.logManager.logs;

    const options: vscode.QuickPickOptions = {
        canPickMany: true
    };

    // https://github.com/Microsoft/vscode/issues/64014
    const logsToShow: MCLog[] | undefined = await vscode.window.showQuickPick(logs, options) as (MCLog[] | undefined);
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

        // stop the stream if 0 logs are to be shown
        await project.logManager.toggleLogStreaming(logsToShow.length !== 0);
        // vscode.window.showInformationMessage(Translator.t(STRING_NS, "hidNLogs", { count: logsToHide.length }));
    }
}
