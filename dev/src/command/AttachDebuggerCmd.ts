import * as vscode from "vscode";

import * as MCUtil from "../MCUtil";
import { promptForProject } from "../command/CommandUtil";
import * as Resources from "../constants/Resources";
import Project from "../microclimate/project/Project";
import ProjectState from "../microclimate/project/ProjectState";
import Log from "../Logger";
import ProjectType from "../microclimate/project/ProjectType";

export default async function attachDebuggerCmd(project: Project): Promise<boolean> {
    Log.d("attachDebuggerCmd");
    if (project == null) {
        const selected = await promptForProject(...ProjectState.getDebuggableStates());
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return false;
        }
        project = selected;
    }

    try {
        // Wait for the server to be Starting - Debug or Debugging before we try to connect the debugger,
        // or it may try to connect before the server is ready
        Log.d(`Waiting for ${project.name} to be ready to for debugging`);
        // often this will resolve instantly
        await project.waitForState(60 * 1000, ...ProjectState.getDebuggableStates());

        // Intermittently for Microprofile projects, the debugger will try to connect too soon,
        // so add an extra delay if it's MP and Starting.
        // This doesn't really slow anything down because the server is still starting anyway.
        const libertyDelayMs = 2500;
        if (project.type.type === ProjectType.Types.MICROPROFILE && project.state.appState === ProjectState.AppStates.DEBUG_STARTING) {
            Log.d(`Waiting extra ${libertyDelayMs}ms for Starting Liberty project`);
            await new Promise( (resolve) => setTimeout(resolve, libertyDelayMs));
        }

        // This should be longer than the timeout we pass to VSCode through the debug config, or the default (whichever is longer).
        const debugConnectTimeoutS = 60;

        Log.d(`${project.name} appears to be ready for debugging`);
        const startDebugWithTimeout = MCUtil.promiseWithTimeout(startDebugSession(project),
            debugConnectTimeoutS * 1000,
            `Debugger did not connect within ${debugConnectTimeoutS}s`
        );

        vscode.window.setStatusBarMessage(`${Resources.getOcticon(Resources.Octicons.bug, true)} Connecting debugger to ${project.name}`,
                startDebugWithTimeout);

        // will throw error if connection fails or timeout
        const successMsg = await startDebugWithTimeout;

        Log.i("Debugger attach success:", successMsg);
        vscode.window.showInformationMessage(successMsg);
        return true;
    }
    catch (err) {
        // Show our error message here. we can't throw/reject or vscode won't know how to handle it
        const failMsg = `Failed to attach debugger to ${project.name} at ${project.debugUrl} `;
        const extraErrMsg = err.message ? err.message : "";
        Log.e(failMsg, extraErrMsg);
        vscode.window.showErrorMessage(failMsg + extraErrMsg);
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
    Log.i("startDebugSession for project " + project.name);
    if (project.type.debugType == null) {
        // Just in case.
        throw new Error(`No debug type available for project of type ${project.type}`);
    }
    else if (project.debugPort == null) {
        throw new Error(`No debug port set for project ${project.name}`);
    }

    const debugConfig: vscode.DebugConfiguration = await getDebugConfig(project);
    const projectFolder = vscode.workspace.getWorkspaceFolder(project.localPath);
    const pfName: string = projectFolder != null ? projectFolder.name : "undefined";
    Log.i("Running debug launch on project folder: " + pfName, debugConfig);

    const priorDebugSession = vscode.debug.activeDebugSession;
    let debugSuccess = await vscode.debug.startDebugging(projectFolder, debugConfig);

    // Show the app logs again - Usually this will have no effect since we showed them when the restart was initiated,
    // but sometimes the Language Server outputstream will be opened over the project one, which is annoying, so put ours back on top.
    project.connection.logManager.getOrCreateAppLog(project.id, project.name).showOutputChannel();

    // startDebugging above will often return 'true' before the debugger actually connects, so it could still fail.
    // Do some extra checks here to ensure that a new debug session was actually launched, and report failure if it wasn't.

    // optional extra error message
    let errDetail: string = "";
    const currentDebugSession = vscode.debug.activeDebugSession;

    if (currentDebugSession == null) {
        Log.w("Debug session failed to launch");
        debugSuccess = false;
    }
    /*
    else if (currentDebugSession.name !== debugConfig.name) {
        Log.w(`There is an active debug session "${currentDebugSession.name}", but it's not the one we just tried to launch`);
        debugSuccess = false;
    }*/
    else if (currentDebugSession.name === debugConfig.name && priorDebugSession != null && priorDebugSession.id === currentDebugSession.id) {
        // This means we were already debugging this project (since the debug session name did match),
        // but failed to create a new session - the old one is still running
        // This probably happened because we tried to Attach Debugger but the debug port was already blocked by an existing session.
        Log.w("Project already had an active debug session, and a new one was not created");
        debugSuccess = false;
        errDetail = `- is it already being debugged?`;
    }
    // TODO if they are already debugging node and they try to debug another node, we can warn them
    // There might be other error scenarios I've missed.
    else {
        Log.i("Debugger connect ostensibly succeeded");
    }

    if (debugSuccess) {
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
 * Updates the existing launch config for debugging this project, or generates and saves a new one if one does not exist.
 *
 * The launch config will be stored under the workspace root folder,
 * whether or not this project is the active workspace (eg it could be stored under microclimate-workspace/.vscode)
 *
 * @return The new debug configuration which can then be passed to startDebugging
 */
async function getDebugConfig(project: Project): Promise<vscode.DebugConfiguration> {
    const launchConfig = vscode.workspace.getConfiguration(LAUNCH, project.localPath);
    const config = launchConfig.get(CONFIGURATIONS, [{}]) as [vscode.DebugConfiguration];
    // Logger.log("Old config:", config);

    const debugName: string = `Debug MC - ${project.name}`;
    // See if we already have a debug launch for this project, so we can replace it.

    let newLaunch: vscode.DebugConfiguration | undefined;

    for (let i = 0; i < config.length; i++) {
        const existingLaunch: vscode.DebugConfiguration = config[i];
        if (existingLaunch != null && existingLaunch.name === debugName) {
            // The launch already exists, only change what we need to - this preserves any valid user edits
            const updatedLaunch = updateDebugLaunchConfig(project, existingLaunch);
            Log.d(`Replacing existing debug launch ${debugName}:`, updatedLaunch);
            config[i] = updatedLaunch;
            newLaunch = updatedLaunch;
            break;
        }
    }

    if (newLaunch == null) {
        // We didn't find an existing one; need to generate a new one
        newLaunch = generateDebugLaunchConfig(debugName, project);

        // already did this in startDebugSession, but just in case
        if (newLaunch == null) {
            const msg = `No debug type available for project of type ${project.type}`;
            Log.e(msg);
            throw new Error(msg);
        }

        Log.d("Pushing new debug launch" + newLaunch.name, newLaunch);
        config.push(newLaunch);
    }

    await launchConfig.update(CONFIGURATIONS, config, vscode.ConfigurationTarget.WorkspaceFolder);
    // Logger.log("New config", launchConfig.get(CONFIGURATIONS));
    return newLaunch;
}

const RQ_ATTACH = "attach";

function generateDebugLaunchConfig(debugName: string, project: Project): vscode.DebugConfiguration | undefined {

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

/**
 * Update the existingLaunch with the new values of config fields that could have changed since the last launch, then return it.
 * As far as I can tell, only the port can change.
 */
function updateDebugLaunchConfig(project: Project, existingLaunch: vscode.DebugConfiguration): vscode.DebugConfiguration {
    const newLaunch: vscode.DebugConfiguration = existingLaunch;
    newLaunch.port = project.debugPort;
    // could be the same port
    Log.d(`Changed port from ${existingLaunch.port} to ${newLaunch.port}`);
    return newLaunch;
}
