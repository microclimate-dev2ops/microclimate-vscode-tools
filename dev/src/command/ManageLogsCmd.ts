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

    // const allProjects = await ConnectionManager.instance.allProjects;
    // const allOpenLogs: MCLog[] = allProjects.reduce((allLogs_: MCLog[], project: Project): MCLog[] => {
    //     return allLogs_.concat(project.logs);
    // }, []);

    await project.logManager.initPromise;
    const logs = project.logManager.logs;

    const options: vscode.QuickPickOptions = {
        canPickMany: true
    };

    // https://github.com/Microsoft/vscode/issues/64014
    // const selection: vscode.QuickPickItem[] | undefined = await vscode.window.showQuickPick(quickPickItems, options);

    // The return type is an array of MCLogs, but we have to mark it as 'any' due to issue linked above
    const selection: any = await vscode.window.showQuickPick(logs, options);
    if (selection != null) {
        // Log.d("selection", selection);

        const logsToShow: MCLog[] = selection as MCLog[];
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
