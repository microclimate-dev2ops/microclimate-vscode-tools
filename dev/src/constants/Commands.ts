
// non-nls-file

enum Commands {
    // all of these must match package.nls.json command IDs
    NEW_CONNECTION = "ext.mc.newConnection",
    NEW_DEFAULT_CONNECTION = "ext.mc.newDefaultConnection",
    REMOVE_CONNECTION = "ext.mc.removeConnection",
    REFRESH_CONNECTION = "ext.mc.refreshConnection",
    CREATE_MC_PROJECT = "ext.mc.createMCProject",

    OPEN_WS_FOLDER = "ext.mc.openWorkspaceFolder",
    ATTACH_DEBUGGER = "ext.mc.attachDebugger",
    RESTART_RUN = "ext.mc.restartProjectRun",
    RESTART_DEBUG = "ext.mc.restartProjectDebug",

    OPEN_IN_BROWSER = "ext.mc.openInBrowser",
    REQUEST_BUILD = "ext.mc.requestBuild",
    TOGGLE_AUTOBUILD = "ext.mc.toggleAutoBuild",
    OPEN_APP_LOG = "ext.mc.openAppLog",
    OPEN_BUILD_LOG = "ext.mc.openBuildLog",
    DISABLE_PROJECT = "ext.mc.disable",
    ENABLE_PROJECT = "ext.mc.enable",
    CONTAINER_SHELL = "ext.mc.containerShell",
    VIEW_PROJECT_INFO = "ext.mc.viewProjectInfo",
    OPEN_APP_MONITOR = "ext.mc.openAppMonitor",

    // VSCode commands, kept here for easy reference. These will never change.
    VSC_OPEN = "vscode.open",
    VSC_OPEN_FOLDER = "vscode.openFolder",
    VSC_REVEAL_IN_OS = "revealFileInOS",
    VSC_REVEAL_EXPLORER = "revealInExplorer",
}

export default Commands;
