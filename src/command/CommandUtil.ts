import * as vscode from "vscode";

import newConnectionCmd from "./NewConnectionCmd";
import goToFolder from "./GoToFolderCmd";
import restartProjectCmd from "./RestartProjectCmd";
import openInBrowserCmd from "./OpenInBrowserCmd";
import Project from "../microclimate/project/Project";
import Connection from "../microclimate/connection/Connection";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import requestBuildCmd from "./RequestBuildCmd";

export function createCommands() {

    return [
        vscode.commands.registerCommand("ext.mc.newConnection", () => newConnectionCmd()),
        vscode.commands.registerCommand("ext.mc.goToFolder", (args) => goToFolder(args)),

        vscode.commands.registerCommand("ext.mc.restartProjectRun", (args) => restartProjectCmd(args, false)),
        vscode.commands.registerCommand("ext.mc.restartProjectDebug", (args) => restartProjectCmd(args, true)),

        vscode.commands.registerCommand("ext.mc.openInBrowser", (args) => openInBrowserCmd(args)),
        vscode.commands.registerCommand("ext.mc.requestBuild", (args) => requestBuildCmd(args))

    ];
}

export async function promptForProject(startedOnly: Boolean): Promise<Project | undefined> {
    const project = await promptForResourceInner(false, startedOnly);
    if (project instanceof Project) {
        return project as Project;
    }
    else if (project instanceof Connection) {
        // should never happen
        console.error("promptForProject received Connection back");
    }

    // user cancelled, or error above
    return undefined;
}

export async function promptForResource(startedProjectsOnly: Boolean): Promise<Project | Connection | undefined> {
    return promptForResourceInner(true, startedProjectsOnly);
}

async function promptForResourceInner(includeConnections: Boolean, startedProjectsOnly: Boolean): Promise<Project | Connection | undefined> {

    // TODO Try to get the name of †he selected project, and have it selected initially
    const choices: vscode.QuickPickItem[] = [];

    const connections = ConnectionManager.instance.connections;
    if (includeConnections) {
        // Convert each Connection into a QuickPickItem
        choices.push(...connections);
    }

    await new Promise<vscode.QuickPickItem[]>( (resolve, _) => {
        connections.forEach( async (conn) => {
            let projects = await conn.getProjects();
            if (startedProjectsOnly) {
                projects = projects.filter( (p) => p.state.isStarted );
            }
            choices.push(...projects);
            return resolve(choices);
        });
    });

    const selection = await vscode.window.showQuickPick(choices, { canPickMany: false, ignoreFocusOut: true });
    if (selection == null) {
        // user cancelled
        return selection;
    }
    else if (selection instanceof Project) {
        return selection as Project;
    }
    else if (selection instanceof Connection) {
        return selection as Connection;
    }
    else {
        console.error(`Unsupported type in promptForResource ${typeof(selection)}`);
        return undefined;
    }
}