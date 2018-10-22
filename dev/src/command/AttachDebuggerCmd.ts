import * as vscode from "vscode";

import * as Icons from "../constants/Icons";
import Project from "../microclimate/project/Project";
import { promptForProject } from "../command/CommandUtil";
import { ProjectState } from "../microclimate/project/ProjectState";
import AppLog from "../microclimate/logs/AppLog";

export default async function attachDebuggerCmd(project: Project): Promise<Boolean> {
    console.log("attachDebuggerCmd");
    if (project == null) {
        const selected = await promptForProject(ProjectState.AppStates.STARTING, ProjectState.AppStates.DEBUGGING);
        if (selected == null) {
            // user cancelled
            console.log("User cancelled project prompt");
            return false;
        }
        project = selected;
    }

    try {
        const startDebugPromise = startDebugSession(project);
        vscode.window.setStatusBarMessage(`${Icons.getOcticon(Icons.Octicons.bug, true)} Connecting debugger to ${project.name}`, startDebugPromise);
        const successMsg = await startDebugPromise;

        console.log("Debugger attach success", successMsg);
        vscode.window.showInformationMessage(successMsg);
        return true;
    }
    catch (err) {
        console.error("Debugger attach failure", err);
        vscode.window.showErrorMessage("Failed to attach debugger: " + err);
        return false;
    }
}

/**
 * Start a debug session for the given project.
 * @return
 *  A promise which resolves to a user-friendly success message,
 *  or throws an Error with a user-friendly error message.
 */
export async function startDebugSession(project: Project): Promise<string> {
    console.log("startDebugSession for project " + project.name);
    if (project.type.debugType == null) {
        // Just in case.
        throw new Error(`No debug type available for project of type ${project.type}`);
    }
    else if (project.debugPort == null) {
        throw new Error(`No debug port set for project ${project.name}`);
    }

    // Wait for the server to be Starting or Debugging before we try to connect the debugger, or it may try to connect before the server is ready
    try {
        await project.waitForState(30000, ProjectState.AppStates.STARTING, ProjectState.AppStates.DEBUGGING);
    }
    catch (err) {
        console.error("Timeout waiting before connecting debugger:", err);
        throw err;
    }

    const debugConfig: vscode.DebugConfiguration = await getDebugConfig(project);
    console.log("Running debug launch:", debugConfig);

    const projectFolder = vscode.workspace.getWorkspaceFolder(project.localPath);
    // TODO need a better way to detect when this fails.
    // startDebugging just returns a boolean -
    // seems if there's an error, it will display an alert at the top of the window
    const success = await vscode.debug.startDebugging(projectFolder, debugConfig);
    console.log("Debugger should have connected");

    if (success) {
        AppLog.getOrCreateLog(project.id, project.name).setDebugConsole(vscode.debug.activeDebugConsole);
        return `Debugging ${project.name} at ${debugConfig.hostName}:${debugConfig.port}`;
    }
    else {
        throw new Error("Failed to start debug session for " + project.name);
    }
}


// keys for launch.json
const LAUNCH = "launch";
const CONFIGURATIONS = "configurations";

/**
 * Generates and saves the launch config for attaching the debugger to this server.
 *
 * The launch config will be stored under the workspace root folder,
 * whether or not this project is the active workspace (eg it could be stored under microclimate-workspace/.vscode)
 *
 * @return The new debug configuration which can then be passed to startDebugging
 */
async function getDebugConfig(project: Project): Promise<vscode.DebugConfiguration> {
    const launchConfig = vscode.workspace.getConfiguration(LAUNCH, project.localPath);
    const config = launchConfig.get(CONFIGURATIONS, [{}]) as Array<{}>;
    // console.log("Old config:", config);

    const debugName = `Debug ${project.name}`;
    // See if we already have a debug launch for this project, so we can replace it.
    // projectID field is used to compare.
    let existingIndex = -1;
    for (let i = 0; i < config.length; i++) {
        const item: any = config[i];
        if (item != null && item.name === debugName) {
            existingIndex = i;
            break;
        }
    }

    // already did this in startDebugSession, but this will make the compiler happy.
    if (project.type.debugType == null) {
        throw new Error(`No debug type available for project of type ${project.type}`);
    }

    const debugConfig: vscode.DebugConfiguration = {
        type: project.type.debugType,
        name: debugName,
        request: "attach",
        hostName: project.connection.host,
        port: project.debugPort,
        // sourcePaths: project.localPath + "/src/"
        projectName: project.name,
    };

    if (existingIndex !== -1) {
        config[existingIndex] = debugConfig;
    }
    else {
        config.push(debugConfig);
    }

    await launchConfig.update(CONFIGURATIONS, config, vscode.ConfigurationTarget.WorkspaceFolder);
    // console.log("New config", launchConfig.get(CONFIGURATIONS));
    return debugConfig;
}