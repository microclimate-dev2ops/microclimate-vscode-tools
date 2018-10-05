import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import { ProjectState } from "../microclimate/project/ProjectState";

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
    console.log("startDebugSession for project " + project.name);
    if (project.type.debugType == null) {
        // Just in case.
        throw new Error(`Failed to attach debugger to ${project.name}: No debug type available for project of type ${project.type}`);
    }
    else if (project.debugPort === -1) {
        throw new Error(`No debug port set for project ${project.name}`);
    }

    // Wait for the server to be Starting before we try to connect the debugger, or it may connect before the server is ready

    await project.waitForState(ProjectState.AppStates.STARTING, 30000);

    const debugConfig: vscode.DebugConfiguration = await getDebugConfig(project);

    console.log("Running debug launch:", debugConfig);

    const projectFolder = vscode.workspace.getWorkspaceFolder(project.localPath);
    const success = await vscode.debug.startDebugging(projectFolder, debugConfig);

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

const LAUNCH = "launch";
const CONFIGURATIONS = "configurations";
/**
 * Generates the
 * @return The new debug configuration which can then be passed to startDebugging
 */
async function getDebugConfig(project: Project): Promise<vscode.DebugConfiguration> {
    const launchConfig = vscode.workspace.getConfiguration(LAUNCH, project.localPath);
    const config = launchConfig.get(CONFIGURATIONS, [{}]) as Array<{}>;
    // console.log("Old config:", config);

    const debugName = `Debug ${project.name} - ${project.id}`;

    // See if we already have a debug launch for this project, so we can replace it.
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
        projectName: project.name
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