import * as vscode from "vscode";

import * as NewConnectionCmd from "./NewConnectionCmd";
import openWorkspaceFolderCmd from "./OpenWorkspaceFolderCmd";
import restartProjectCmd from "./RestartProjectCmd";
import openInBrowserCmd from "./OpenInBrowserCmd";
import requestBuildCmd from "./RequestBuildCmd";
import openBuildLogCmd from "./OpenBuildLogCmd";
import openAppLogCmd from "./OpenAppLogCmd";
import toggleEnablementCmd from "./ToggleEnablementCmd";
import removeConnectionCmd from "./RemoveConnectionCmd";
import containerBashCmd from "./ContainerShellCmd";
import viewProjectInfoCmd from "./ViewProjectInfoCmd";
import attachDebuggerCmd from "./AttachDebuggerCmd";

import Project from "../microclimate/project/Project";
import Connection from "../microclimate/connection/Connection";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import { ProjectState } from "../microclimate/project/ProjectState";
import { Logger } from "../Logger";

export function createCommands(): vscode.Disposable[] {

    // Register our commands here
    // The first parameter must match the command ID as declared in package.json
    // the second parameter is the callback function, which is passed the user's selection, which is either:
    // - undefined (if run from command palette)
    // - or the user's selected TreeView object (if run from the context menu) -> IE either a Project or Connection
    return [
        vscode.commands.registerCommand(NewConnectionCmd.NEW_CONNECTION_CMD_ID, () => NewConnectionCmd.newConnectionCmd()),
        vscode.commands.registerCommand("ext.mc.newDefaultConnection", () => NewConnectionCmd.tryAddConnection(NewConnectionCmd.DEFAULT_CONNINFO)),
        vscode.commands.registerCommand("ext.mc.removeConnection", (selection) => removeConnectionCmd(selection)),

        vscode.commands.registerCommand("ext.mc.openWorkspaceFolder", (selection) => openWorkspaceFolderCmd(selection)),

        vscode.commands.registerCommand("ext.mc.attachDebugger",        (selection) => attachDebuggerCmd(selection)),
        vscode.commands.registerCommand("ext.mc.restartProjectRun",     (selection) => restartProjectCmd(selection, false)),
        vscode.commands.registerCommand("ext.mc.restartProjectDebug",   (selection) => restartProjectCmd(selection, true)),

        vscode.commands.registerCommand("ext.mc.openInBrowser", (selection) => openInBrowserCmd(selection)),
        vscode.commands.registerCommand("ext.mc.requestBuild",  (selection) => requestBuildCmd(selection)),

        vscode.commands.registerCommand("ext.mc.openBuildLog",  (selection) => openBuildLogCmd(selection)),
        vscode.commands.registerCommand("ext.mc.openAppLog",    (selection) => openAppLogCmd(selection)),

        vscode.commands.registerCommand("ext.mc.disable",   (selection) => toggleEnablementCmd(selection, false)),
        vscode.commands.registerCommand("ext.mc.enable",    (selection) => toggleEnablementCmd(selection, true)),

        vscode.commands.registerCommand("ext.mc.containerBash", (selection) => containerBashCmd(selection)),

        vscode.commands.registerCommand("ext.mc.viewProjectInfo", (selection) => viewProjectInfoCmd(selection))
    ];
}

// Some commands require a project or connection to be selected,
// if they're launched from the command pallet we have to ask which resource they want to run the command on.
// The functions below handle this use case.

// only return projects that are in an 'acceptableState' (or pass no acceptable states for all projects)
export async function promptForProject(...acceptableStates: ProjectState.AppStates[]): Promise<Project | undefined> {
    const project = await promptForResourceInner(false, true, ...acceptableStates);
    if (project instanceof Project) {
        return project as Project;
    }
    else {
        // should never happen
        Logger.logE("promptForProject received something other than a project back:", project);
    }

    // user cancelled, or error above
    return undefined;
}

export async function promptForConnection(): Promise<Connection | undefined> {
    const connection = await promptForResourceInner(true, false);
    if (connection instanceof Connection) {
        return connection as Connection;
    }
    else {
        // should never happen
        Logger.logE("promptForConnection received something other than a connection back:", connection);
    }

    // user cancelled, or error above
    return undefined;
}

export async function promptForResource(...acceptableStates: ProjectState.AppStates[]): Promise<Project | Connection | undefined> {
    return promptForResourceInner(true, true, ...acceptableStates);
}

async function promptForResourceInner(includeConnections: Boolean, includeProjects: Boolean, ...acceptableStates: ProjectState.AppStates[]):
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
        if (acceptableStates.indexOf(ProjectState.AppStates.STARTED) !== -1
                && acceptableStates.indexOf(ProjectState.AppStates.DEBUGGING) === -1) {

            acceptableStates.push(ProjectState.AppStates.DEBUGGING);
        }

        Logger.log("Accept states", acceptableStates);

        // For each connection, get its project list, and filter by projects we're interested in.
        // then add the remaining projects to our QuickPick choices.
        for (const conn of connections) {
            let projects = await conn.getProjects();

            if (acceptableStates.length > 0) {
                // Filter out projects that are not in one of the acceptable states
                projects = projects.filter( (p) => {
                    return acceptableStates.indexOf(p.state.appState) !== -1;
                    // Logger.log("the index of ", p.state.appState, " in ", acceptableStates, " is ", index);
                });
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

    const selection = await vscode.window.showQuickPick(choices, { canPickMany: false, ignoreFocusOut: choices.length !== 0 });
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
        Logger.logE(`Unsupported type in promptForResource ${typeof(selection)}`);
        return undefined;
    }
}