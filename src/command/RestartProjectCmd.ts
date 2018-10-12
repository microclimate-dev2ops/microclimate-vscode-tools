import * as vscode from "vscode";

import Project from "microclimate/project/Project";
import { promptForProject } from "command/CommandUtil";
import { ProjectState } from "microclimate/project/ProjectState";
import AppLog from "microclimate/logs/AppLog";
import { getOcticon, getStartMode } from "MCUtil";

export default async function restartProjectCmd(project: Project, debug: Boolean): Promise<void> {
    console.log("RestartProjectCmd invoked");
    if (project == null) {
        const selected = await promptForProject(ProjectState.AppStates.STARTED, ProjectState.AppStates.STARTING);
        if (selected == null) {
            // user cancelled
            console.log("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    /*
    // TODO remove this - Portal should do it
    if (!project.state.isStarted) {
        vscode.window.showErrorMessage("You can only restart projects that are already Started");
        return;
    }*/

    AppLog.getOrCreateLog(project.id, project.name).unsetDebugConsole();
    console.log(`RestartProject on project ${project.name} into ${getStartMode(debug)} mode`);

    const restartRequestPromise = project.connection.requestProjectRestart(project, debug);
    vscode.window.setStatusBarMessage(`${getOcticon("sync", true)} Initiating restarting ${project.name}`, restartRequestPromise);
    // After the above async REST request, we don't do anything further for this command until
    // the Socket receives a projectRestartResult event, which will then call the methods below.
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

    // Wait for the server to be Starting before we try to connect the debugger, or it may connect before the server is ready

    try {
        await project.waitForState(ProjectState.AppStates.STARTING, 30000);
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

    const debugConfig: vscode.DebugConfiguration = {
        type: project.type.debugType || "",
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