import * as vscode from "vscode";

import * as MCUtil from "../MCUtil";
import { promptForProject } from "../command/CommandUtil";
import * as Resources from "../constants/Resources";
import AppLog from "../microclimate/logs/AppLog";
import Project from "../microclimate/project/Project";
import ProjectState from "../microclimate/project/ProjectState";
import Logger from "../Logger";
import ProjectType from "../microclimate/project/ProjectType";


export default async function attachDebuggerCmd(project: Project): Promise<Boolean> {
    Logger.log("attachDebuggerCmd");
    if (project == null) {
        const selected = await promptForProject(ProjectState.AppStates.STARTING, ProjectState.AppStates.DEBUGGING);
        if (selected == null) {
            // user cancelled
            Logger.log("User cancelled project prompt");
            return false;
        }
        project = selected;
    }

    try {
        // This should be longer than the timeout we pass to VSCode through the debug config, or the default (whichever is longer).
        // It's 10s for Node projects, seems to be a lot shorter for Java, so 15s is fine.
        // The user could make the timeout longer which would cause this to not work as intended,
        // but they will likely understand what's happening in that case.
        const timeoutS = 15;

        const startDebugWithTimeout = MCUtil.promiseWithTimeout(startDebugSession(project),
            timeoutS * 1000,
            `Debugger did not connect within ${timeoutS}s`);

        vscode.window.setStatusBarMessage(`${Resources.getOcticon(Resources.Octicons.bug, true)} Connecting debugger to ${project.name}`,
                startDebugWithTimeout);

        // will throw error if connection fails or timeout
        const successMsg = await startDebugWithTimeout;

        Logger.log("Debugger attach success", successMsg);
        vscode.window.showInformationMessage(successMsg);
        return true;
    }
    catch (err) {
        const failMsg = `Failed to attach debugger to ${project.name} at ${project.debugUrl} `;
        Logger.logE(failMsg, err);
        vscode.window.showErrorMessage(failMsg + err.message.toString());
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
    Logger.log("startDebugSession for project " + project.name);
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
        Logger.logE("Timeout waiting before connecting debugger:", err);
        throw err;
    }

    const debugConfig: vscode.DebugConfiguration = await getDebugConfig(project);
    const projectFolder = vscode.workspace.getWorkspaceFolder(project.localPath);
    Logger.log("Running debug launch:", debugConfig, "on project folder:", projectFolder);

    const priorDebugSession = vscode.debug.activeDebugSession;
    let debugSuccess = await vscode.debug.startDebugging(projectFolder, debugConfig);
    Logger.log("Debugger should have connected");

    // startDebugging above will often return 'true' before the debugger actually connects, so it could still fail.
    // Do some extra checks here to ensure that a new debug session was actually launched, and report failure if it wasn't.

    // optional extra error message
    let errDetail: string = "";
    const newDebugSession = vscode.debug.activeDebugSession;

    if (newDebugSession == null || newDebugSession.name !== debugConfig.name) {
        Logger.logW("Debug session failed to launch");
        debugSuccess = false;
    }
    else if (priorDebugSession != null && priorDebugSession.id === newDebugSession.id) {
        // This means we were already debugging this project (since the debug session name did match above),
        // and we failed to create a new session - the old one is still running
        Logger.logW("Project already had an active debug session, and a new one was not created");
        debugSuccess = false;
        errDetail = `- is it already being debugged?`;
    }
    // There might be other error scenarios I've missed.
    else {
        Logger.log("Debugger connect apparently succeeded");
    }

    if (debugSuccess) {
        // open the app's logs
        AppLog.getOrCreateLog(project.id, project.name).showOutputChannel();
        return `Debugging ${project.name} at ${project.debugUrl}`;
    }
    else {
        throw new Error(errDetail);
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
    // Logger.log("Old config:", config);

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

    const debugConfig: vscode.DebugConfiguration | undefined = generateDebugConfiguration(debugName, project);

    // already did this in startDebugSession, but just in case
    if (debugConfig == null) {
        throw new Error(`No debug type available for project of type ${project.type}`);
    }

    if (existingIndex !== -1) {
        config[existingIndex] = debugConfig;
    }
    else {
        config.push(debugConfig);
    }

    await launchConfig.update(CONFIGURATIONS, config, vscode.ConfigurationTarget.WorkspaceFolder);
    // Logger.log("New config", launchConfig.get(CONFIGURATIONS));
    return debugConfig;
}

const RQ_ATTACH = "attach";

function generateDebugConfiguration(debugName: string, project: Project): vscode.DebugConfiguration | undefined {
    switch (project.type.debugType) {
        case ProjectType.DebugTypes.JAVA: {
            return {
                type: project.type.debugType.toString(),
                name: debugName,
                request: RQ_ATTACH,
                hostName: project.connection.host,
                port: project.debugPort,
                // sourcePaths: project.localPath + "/src/"
                projectName: project.name,
            };
        }
        case ProjectType.DebugTypes.NODE: {
            return {
                type: project.type.debugType.toString(),
                name: debugName,
                request: RQ_ATTACH,
                address: project.connection.host,
                port: project.debugPort,
                localRoot: project.localPath.fsPath,
                // TODO user could change this in their dockerfile
                remoteRoot: "/app",
                restart: true
            };
        }
        default:
            return undefined;
    }
}