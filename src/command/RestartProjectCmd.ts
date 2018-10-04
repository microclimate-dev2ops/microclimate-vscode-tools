import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";

export default async function restartProjectCmd(project: Project, debug: Boolean): Promise<void> {
    console.log("RestartProjectCmd invoked");
    if (project == null) {
        const selected = await promptForProject(true);
        if (selected == null) {
            // user cancelled
            console.log("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    // TODO remove this - Portal should do it
    if (!project.state.isStarted) {
        vscode.window.showErrorMessage("You can only restart projects that are already Started");
        return;
    }

    console.log(`RestartProject on project ${project.name} into debug mode? ${debug}`);

    project.connection.requestProjectRestart(project, debug);
}


/**
 * Start a debug session for the given project.
 * @return
 *  A promise which resolves to a user-friendly success message,
 *  or throws an Error with a user-friendly error message.
 */
export async function startDebugSession(project: Project): Promise<string> {
    if (project.type.debugType == null) {
        // Just in case.
        throw new Error(`Failed to attach debugger to ${project.name}: No debug type available for project of type ${project.type}`);
    }
    else if (project.debugPort === -1) {
        throw new Error(`No debug port set for project ${project.name}`);
    }

    // vscode.workspace.getConfiguration("launch", )

    // TODO consider dropping this config into the launch.json
    // so the user understands how this works, and they can reproduce it themselves.
    const debugConfig: vscode.DebugConfiguration = {
        type: project.type.debugType,
        name: `Debug ${project.name}`,
        request: "attach",
        hostName: project.connection.host,
        port: project.debugPort,
        // sourcePaths: project.localPath + "/src/"
        projectName: project.name
    };

    // const projectFolder = vscode.workspace.getWorkspaceFolder(project.localPath);
    console.log("Starting debug session now with config", debugConfig);
    const success = await vscode.debug.startDebugging(undefined, debugConfig);
    console.log("Debugger should have connected");

    if (success) {
        // TODO hook up the debug console to the app's output
        return `Debugging ${project.name} at ${debugConfig.hostName}:${debugConfig.port}`;
    }
    else {
        // startDebugging just returns a boolean - not sure if there is a way to diagnose reasons for failure,
        // though it does log some stuff to the console
        throw new Error("Failed to start debug session for " + project.name);
    }
}