/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

// non-nls-file

enum Commands {
    // all of these must match package.nls.json command IDs
    NEW_CONNECTION = "ext.mc.newConnection",
    NEW_DEFAULT_CONNECTION = "ext.mc.newDefaultConnection",
    REMOVE_CONNECTION = "ext.mc.removeConnection",
    REFRESH_CONNECTION = "ext.mc.refreshConnection",
    CREATE_MC_PROJECT = "ext.mc.createMCProject",
    IMPORT_MC_PROJECT = "ext.mc.importMCProject",

    OPEN_WS_FOLDER = "ext.mc.openWorkspaceFolder",
    ATTACH_DEBUGGER = "ext.mc.attachDebugger",
    RESTART_RUN = "ext.mc.restartProjectRun",
    RESTART_DEBUG = "ext.mc.restartProjectDebug",

    OPEN_IN_BROWSER = "ext.mc.openInBrowser",
    REQUEST_BUILD = "ext.mc.requestBuild",
    TOGGLE_AUTOBUILD = "ext.mc.toggleAutoBuild",
    ENABLE_AUTOBUILD = "ext.mc.enableAutoBuild",
    DISABLE_AUTOBUILD =  "ext.mc.disableAutoBuild",

    MANAGE_LOGS = "ext.mc.manageLogs",
    DISABLE_PROJECT = "ext.mc.disable",
    ENABLE_PROJECT = "ext.mc.enable",
    CONTAINER_SHELL = "ext.mc.containerShell",
    PROJECT_OVERVIEW = "ext.mc.projectOverview",
    OPEN_APP_MONITOR = "ext.mc.openAppMonitor",
    VALIDATE = "ext.mc.validate",

    // VSCode commands, kept here for easy reference. These will never change.
    VSC_OPEN = "vscode.open",
    VSC_OPEN_FOLDER = "vscode.openFolder",
    VSC_REVEAL_IN_OS = "revealFileInOS",
    VSC_REVEAL_EXPLORER = "revealInExplorer",
    VSC_FOCUS_PROBLEMS = "workbench.action.problems.focus",
}

export default Commands;
