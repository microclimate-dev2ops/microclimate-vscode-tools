import * as vscode from "vscode";

import Project from "./Project";
import Log from "../../Logger";
import ProjectType from "./ProjectType";

export default class DebugUtils {

    private constructor() {}

    /**
     * Start a debug session for the given project.
     * @return
     *  A promise which resolves to a user-friendly success message,
     *  or throws an Error with a user-friendly error message.
     */
    public static async startDebugSession(project: Project): Promise<string> {
        Log.i("startDebugSession for project " + project.name);
        if (project.type.debugType == null) {
            // Just in case.
            throw new Error(`No debug type available for project of type ${project.type}`);
        }
        else if (project.debugPort == null) {
            throw new Error(`No debug port set for project ${project.name}`);
        }

        const debugConfig: vscode.DebugConfiguration = await DebugUtils.setDebugConfig(project);
        const projectFolder = vscode.workspace.getWorkspaceFolder(project.localPath);
        const pfName: string = projectFolder != null ? projectFolder.name : "undefined";
        Log.i("Running debug launch on project folder: " + pfName, debugConfig);

        const priorDebugSession = vscode.debug.activeDebugSession;
        let debugSuccess = await vscode.debug.startDebugging(projectFolder, debugConfig);

        // Show the app logs again - Usually this will have no effect since we showed them when the restart was initiated,
        // but sometimes the Language Server outputstream will be opened over the project one, which is annoying, so put ours back on top.
        project.connection.logManager.getOrCreateAppLog(project.id, project.name).showOutputChannel();

        // startDebugging above will often return 'true' before the debugger actually connects, so it could still fail.
        // EG connection refused / timeout are not handled by startDebugging
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
            // This means we were already debugging this project but failed to create a new session - the old one is still running
            // This probably happened because we tried to Attach Debugger but the debug port was already blocked by an existing session.
            Log.w("Project already had an active debug session, and a new one was not created");
            debugSuccess = false;
            errDetail = `- is the debug port already in use?`;
        }
        // TODO if they are already debugging node and they try to debug another node, the debug console will only be for the new session
        // There might be other error scenarios I've missed.
        else {
            Log.i("Debugger attach appeared to succeed");
        }

        if (debugSuccess) {
            return `Debugger attached to ${project.name} at ${project.debugUrl}`;
        }
        else {
            throw new Error(errDetail);
        }
    }

    private static getDebugName(project: Project): string {
        return `Debug ${project.name}`;
    }

    // keys for launch.json
    private static readonly LAUNCH: string = "launch";
    private static readonly CONFIGURATIONS: string = "configurations";

    /**
     * Updates the existing launch config for debugging this project, or generates and saves a new one if one does not exist.
     *
     * The launch config will be stored under the workspace folder.
     *
     * @return The new debug configuration which can then be passed to startDebugging
     */
    public static async setDebugConfig(project: Project): Promise<vscode.DebugConfiguration> {
        const debugName: string = DebugUtils.getDebugName(project);

        let newLaunch: vscode.DebugConfiguration | undefined;

        const workspaceConfig = vscode.workspace.getConfiguration(DebugUtils.LAUNCH, project.connection.workspacePath);
        const launchConfigs = workspaceConfig.get(DebugUtils.CONFIGURATIONS, [{}]) as [vscode.DebugConfiguration];

        // See if we already have a debug launch for this project, so we can replace it
        for (let i = 0; i < launchConfigs.length; i++) {
            const existingLaunch: vscode.DebugConfiguration = launchConfigs[i];
            if (existingLaunch != null && existingLaunch.name === debugName) {
                const updatedLaunch = DebugUtils.updateDebugLaunchConfig(project, existingLaunch);
                Log.d(`Replacing existing debug launch ${debugName}:`, updatedLaunch);
                launchConfigs[i] = updatedLaunch;
                newLaunch = updatedLaunch;
            }
        }

        if (newLaunch == null) {
            // We didn't find an existing launch; need to generate a new one
            newLaunch = DebugUtils.generateDebugLaunchConfig(debugName, project);

            // already did this in startDebugSession, but just in case
            if (newLaunch == null) {
                const msg = `No debug type available for project of type ${project.type}`;
                Log.e(msg);
                throw new Error(msg);
            }

            Log.d("Pushing new debug launch" + newLaunch.name, newLaunch);
            launchConfigs.push(newLaunch);
        }

        await workspaceConfig.update(DebugUtils.CONFIGURATIONS, launchConfigs, vscode.ConfigurationTarget.Workspace);
        Log.d("Updated launch configs");
        // Logger.log("New config", launchConfig.get(CONFIGURATIONS));
        return newLaunch;
    }

    private static readonly RQ_ATTACH: string = "attach";

    public static generateDebugLaunchConfig(debugName: string, project: Project): vscode.DebugConfiguration | undefined {

        switch (project.type.debugType) {
            case ProjectType.DebugTypes.JAVA: {
                return {
                    type: project.type.debugType.toString(),
                    name: debugName,
                    request: DebugUtils.RQ_ATTACH,
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
                    request: DebugUtils.RQ_ATTACH,
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
    private static updateDebugLaunchConfig(project: Project, existingLaunch: vscode.DebugConfiguration): vscode.DebugConfiguration {
        const newLaunch: vscode.DebugConfiguration = existingLaunch;
        newLaunch.port = project.debugPort;
        if (existingLaunch.port === newLaunch.port) {
            Log.d(`Debug port for ${project.name} didn't change`);
        }
        else {
            Log.d(`Debug port for ${project.name} changed from ${existingLaunch.port} to ${newLaunch.port}`);
        }

        return newLaunch;
    }

    /**
     * Search the workspace's launch configurations for one that is for this project, and delete it if it exists.
     * Returns a promise that resolves to whether or not a matching launch config was found and deleted.
     */
    public static async removeDebugLaunchConfigFor(project: Project): Promise<boolean> {
        const workspaceConfig = vscode.workspace.getConfiguration(DebugUtils.LAUNCH, project.connection.workspacePath);
        const launchConfigs = workspaceConfig.get(DebugUtils.CONFIGURATIONS, [{}]) as [vscode.DebugConfiguration];

        const debugName = this.getDebugName(project);
        let indexToDelete = -1;
        for (let i = 0; i < launchConfigs.length; i++) {
            const existingLaunch: vscode.DebugConfiguration = launchConfigs[i];
            if (existingLaunch != null && existingLaunch.name === debugName) {
                indexToDelete = i;
                break;
            }
        }

        if (indexToDelete !== -1) {
            launchConfigs.splice(indexToDelete, 1);

            Log.d(`Remove debug launch config for project ${project.name}`);
            await workspaceConfig.update(DebugUtils.CONFIGURATIONS, launchConfigs, vscode.ConfigurationTarget.Workspace);
            return true;
        }
        else {
            Log.d(`Requested to delete launch for ${project.name}, but no launch was found`);
            return false;
        }
    }
}
