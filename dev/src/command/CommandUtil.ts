import * as vscode from "vscode";

import { Log } from "../Logger";
import Project from "../microclimate/project/Project";
import Connection from "../microclimate/connection/Connection";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import { ProjectState } from "../microclimate/project/ProjectState";

import Commands from "../constants/Commands";

import * as NewConnectionCmd from "./NewConnectionCmd";
import openWorkspaceFolderCmd from "./OpenWorkspaceFolderCmd";
import restartProjectCmd from "./RestartProjectCmd";
import openInBrowserCmd from "./OpenInBrowserCmd";
import requestBuildCmd from "./RequestBuildCmd";
import toggleEnablementCmd from "./ToggleEnablementCmd";
import removeConnectionCmd from "./RemoveConnectionCmd";
import containerBashCmd from "./ContainerShellCmd";
import projectInfoCmd from "./ProjectInfoCmd";
import attachDebuggerCmd from "./AttachDebuggerCmd";
import openLogCmd from "./OpenLogCmd";
import toggleAutoBuildCmd from "./ToggleAutoBuildCmd";
import openAppMonitorCmd from "./OpenAppMonitor";
import refreshConnectionCmd from "./RefreshConnectionCmd";
import newMCProjectCmd from "./NewMCProjectCmd";

export function createCommands(): vscode.Disposable[] {

    // Register our commands here
    // The first parameter must match the command ID as declared in package.json
    // the second parameter is the callback function, which is passed the user's selection, which is either:
    // - undefined (if run from command palette)
    // - or the user's selected TreeView object (if run from the context menu) -> IE either a Project or Connection
    return [
        vscode.commands.registerCommand(Commands.NEW_CONNECTION, () => NewConnectionCmd.newConnectionCmd()),
        vscode.commands.registerCommand(Commands.NEW_DEFAULT_CONNECTION, () => NewConnectionCmd.tryAddConnection(NewConnectionCmd.DEFAULT_CONNINFO)),

        vscode.commands.registerCommand(Commands.REMOVE_CONNECTION,     (selection) => removeConnectionCmd(selection)),
        vscode.commands.registerCommand(Commands.REFRESH_CONNECTION,    (selection) => refreshConnectionCmd(selection)),

        vscode.commands.registerCommand(Commands.CREATE_MC_PROJECT, (selection) => newMCProjectCmd(selection)),

        vscode.commands.registerCommand(Commands.OPEN_WS_FOLDER,    (selection) => openWorkspaceFolderCmd(selection)),

        vscode.commands.registerCommand(Commands.ATTACH_DEBUGGER,   (selection) => attachDebuggerCmd(selection)),
        vscode.commands.registerCommand(Commands.RESTART_RUN,       (selection) => restartProjectCmd(selection, false)),
        vscode.commands.registerCommand(Commands.RESTART_DEBUG,     (selection) => restartProjectCmd(selection, true)),

        vscode.commands.registerCommand(Commands.OPEN_IN_BROWSER,   (selection) => openInBrowserCmd(selection)),

        vscode.commands.registerCommand(Commands.REQUEST_BUILD,     (selection) => requestBuildCmd(selection)),
        vscode.commands.registerCommand(Commands.TOGGLE_AUTOBUILD,  (selection) => toggleAutoBuildCmd(selection)),

        vscode.commands.registerCommand(Commands.OPEN_APP_LOG,      (selection) => openLogCmd(selection, true)),
        vscode.commands.registerCommand(Commands.OPEN_BUILD_LOG,    (selection) => openLogCmd(selection, false)),

        vscode.commands.registerCommand(Commands.DISABLE_PROJECT,   (selection) => toggleEnablementCmd(selection, false)),
        vscode.commands.registerCommand(Commands.ENABLE_PROJECT,    (selection) => toggleEnablementCmd(selection, true)),

        vscode.commands.registerCommand(Commands.CONTAINER_SHELL,   (selection) => containerBashCmd(selection)),

        vscode.commands.registerCommand(Commands.VIEW_PROJECT_INFO, (selection) => projectInfoCmd(selection)),

        vscode.commands.registerCommand(Commands.OPEN_APP_MONITOR,  (selection) => openAppMonitorCmd(selection))
    ];
}

// Some commands require a project or connection to be selected,
// if they're launched from the command pallet we have to ask which resource they want to run the command on.
// The functions below handle this use case.

/**
 *
 * @param acceptableStates - If at least one state is passed, only projects in one of these states will be presented to the user.
 */
export async function promptForProject(...acceptableStates: ProjectState.AppStates[]): Promise<Project | undefined> {
    const project = await promptForResourceInner(false, true, ...acceptableStates);
    if (project instanceof Project) {
        return project as Project;
    }
    else if (project != null) {
        // should never happen
        Log.e("promptForProject received something other than a project back:", project);
    }

    // user cancelled, or error above
    return undefined;
}

export async function promptForConnection(): Promise<Connection | undefined> {
    if (ConnectionManager.instance.connections.length === 1) {
        return ConnectionManager.instance.connections[0];
    }

    const connection = await promptForResourceInner(true, false);
    if (connection instanceof Connection) {
        return connection as Connection;
    }
    else if (connection != null) {
        // should never happen
        Log.e("promptForConnection received something other than a connection back:", connection);
    }

    // user cancelled, or error above
    return undefined;
}

export async function promptForResource(...acceptableStates: ProjectState.AppStates[]): Promise<Project | Connection | undefined> {
    return promptForResourceInner(true, true, ...acceptableStates);
}

async function promptForResourceInner(includeConnections: boolean, includeProjects: boolean, ...acceptableStates: ProjectState.AppStates[]):
        Promise<Project | Connection | undefined> {

    // TODO Try to get the name of †he selected project, and have it selected initially - if this is possible.
    const choices: vscode.QuickPickItem[] = [];

    const connections = ConnectionManager.instance.connections;
    if (includeConnections) {
        // Convert each Connected Connection into a QuickPickItem
        choices.push(... (connections.filter( (conn) => conn.isConnected)));
    }

    if (includeProjects) {
        // for now, assume if they want Started, they also accept Debugging. This may change.
        if (acceptableStates.includes(ProjectState.AppStates.STARTED) && !acceptableStates.includes(ProjectState.AppStates.DEBUGGING)) {
            acceptableStates.push(ProjectState.AppStates.DEBUGGING);
        }

        // Logger.log("Accept states", acceptableStates);

        // For each connection, get its project list, and filter by projects we're interested in.
        // then add the remaining projects to our QuickPick choices.
        for (const conn of connections) {
            let projects = await conn.getProjects();

            if (acceptableStates.length > 0) {
                // Filter out projects that are not in one of the acceptable states
                projects = projects.filter( (p) => acceptableStates.includes(p.state.appState));
            }
            choices.push(...projects);
        }
    }

    // If no choices are available, show a message
    if (choices.length === 0) {
        let requiredStatesStr: string = "";

        if (acceptableStates.length !== 0) {
            requiredStatesStr += acceptableStates.map( (state) => state.toString()).join(", ");
        }

        // TODO improve the msg.
        const msg = `There is no ${includeConnections ? " Connection, or" : ""} ${requiredStatesStr} Project ` +
                `on which to run this command.`;
        vscode.window.showWarningMessage(msg, /*{ modal: true }*/);
        return undefined;
    }

    const selection = await vscode.window.showQuickPick(choices, { canPickMany: false, /*ignoreFocusOut: choices.length !== 0*/ });
    if (selection == null) {
        // user cancelled
        return undefined;
    }
    else if (selection instanceof Project) {
        return selection as Project;
    }
    else if (selection instanceof Connection) {
        return selection as Connection;
    }
    else {
        Log.e(`Unsupported type in promptForResource ${typeof(selection)}`);
        return undefined;
    }
}
