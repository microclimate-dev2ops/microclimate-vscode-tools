/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import Project from "./Project";
import Log from "../../Logger";
import ProjectType from "./ProjectType";
import { Connection } from "../connection/ConnectionExporter";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Translator from "../../constants/strings/translator";

const STRING_NS = StringNamespaces.DEBUG;

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
            throw new Error(Translator.t(STRING_NS, "noDebugTypeKnown", { type: project.type.type }));
        }
        else if (project.debugPort == null) {
            throw new Error(Translator.t(STRING_NS, "noDebugPort", { projectName: project.name }));
        }

        const debugConfig: vscode.DebugConfiguration = await DebugUtils.setDebugConfig(project);
        const projectFolder = vscode.workspace.getWorkspaceFolder(project.localPath);
        const pfName: string = projectFolder != null ? projectFolder.name : "undefined";        // non-nls
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
        let errDetail: string = "";     // non-nls
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
            errDetail = Translator.t(STRING_NS, "maybeAlreadyDebugging");
        }
        // TODO if they are already debugging node and they try to debug another node, the debug console will only be for the new session
        // There might be other error scenarios I've missed.
        else {
            Log.i("Debugger attach appeared to succeed");
        }

        if (debugSuccess) {
            return Translator.t(STRING_NS, "debuggerAttachSuccess", { projectName: project.name, debugUrl: project.debugUrl });
        }
        else {
            throw new Error(errDetail);
        }
    }

    /**
     * Search the workspace's launch configurations for one that is for this project, and delete it if it exists.
     * Returns a promise that resolves to whether or not a matching launch config was found and deleted.
     */
    public static async removeDebugLaunchConfigFor(project: Project): Promise<boolean> {
        const workspaceConfig = this.getWorkspaceConfigFor(project.connection);
        const launchConfigs = this.getLaunchConfigurationsFrom(workspaceConfig);

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
            await this.updateWorkspaceLaunchConfigs(workspaceConfig, launchConfigs);
            Log.i(`Removed debug launch config for project ${project.name}`);

            return true;
        }
        else {
            Log.d(`Requested to delete launch for ${project.name}, but no launch was found`);
            return false;
        }
    }

    public static async cleanDebugLaunchConfigsFor(connection: Connection): Promise<void> {
        Log.d("Clean launch configs from " + connection.workspacePath);

        // The potential names of the projects' debug configurations, whether or not they exist
        const projectDebugNames: string[] = (await connection.getProjects()).map( (project) => this.getDebugName(project));

        const workspaceConfig = this.getWorkspaceConfigFor(connection);
        const launchConfigs = this.getLaunchConfigurationsFrom(workspaceConfig);

        // Loop backwards so we can remove elements
        for (let i = launchConfigs.length - 1; i >= 0; i--) {
            const existingLaunch: vscode.DebugConfiguration = launchConfigs[i];
            if (!projectDebugNames.includes(existingLaunch.name)) {
                // This launch config does not map to an existing project, so we delete it.
                Log.i(`Delete launch config: ${existingLaunch.name}`);
                launchConfigs.splice(i, 1);
            }
        }

        await this.updateWorkspaceLaunchConfigs(workspaceConfig, launchConfigs);
    }

    // keys for launch.json
    private static readonly LAUNCH: string = "launch";                      // non-nls
    private static readonly CONFIGURATIONS: string = "configurations";      // non-nls

    private static getWorkspaceConfigFor(connection: Connection): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(DebugUtils.LAUNCH, connection.workspacePath);
    }

    private static getLaunchConfigurationsFrom(workspaceConfig: vscode.WorkspaceConfiguration): vscode.DebugConfiguration[] {
        return workspaceConfig.get(DebugUtils.CONFIGURATIONS, [{}]) as [vscode.DebugConfiguration];
    }

    private static async updateWorkspaceLaunchConfigs(
            workspaceConfig: vscode.WorkspaceConfiguration,
            newLaunchConfigs: vscode.DebugConfiguration[]
        ): Promise<void> {

        return workspaceConfig.update(DebugUtils.CONFIGURATIONS, newLaunchConfigs, vscode.ConfigurationTarget.Workspace);
    }

    private static getDebugName(project: Project): string {
        return Translator.t(STRING_NS, "debugLaunchName", { projectName: project.name });
    }

    /**
     * Updates the existing launch config for debugging this project, or generates and saves a new one if one does not exist.
     *
     * The launch config will be stored under the workspace folder.
     *
     * @return The new debug configuration which can then be passed to startDebugging
     */
    private static async setDebugConfig(project: Project): Promise<vscode.DebugConfiguration> {
        const debugName: string = DebugUtils.getDebugName(project);

        let launchToWrite: vscode.DebugConfiguration | undefined;

        const workspaceConfig = this.getWorkspaceConfigFor(project.connection);
        const launchConfigs = this.getLaunchConfigurationsFrom(workspaceConfig);

        // See if we already have a debug launch for this project, so we can replace it
        for (let i = 0; i < launchConfigs.length; i++) {
            const existingLaunch: vscode.DebugConfiguration = launchConfigs[i];
            if (existingLaunch != null && existingLaunch.name === debugName) {
                // updatedLaunch might be the same as existingLaunch.
                const updatedLaunch: vscode.DebugConfiguration = DebugUtils.updateDebugLaunchConfig(project, existingLaunch);

                const changed = updatedLaunch !== existingLaunch;
                if (changed) {
                    Log.d(`Replacing existing debug launch ${debugName}:`, updatedLaunch);
                    launchConfigs[i] = updatedLaunch;
                }
                else {
                    Log.d(`No change to debug launch ${debugName}`);
                }
                launchToWrite = updatedLaunch;
                break;
            }
        }

        if (launchToWrite == null) {
            // We didn't find an existing launch; need to generate a new one
            launchToWrite = DebugUtils.generateDebugLaunchConfig(debugName, project);

            // already did this in startDebugSession, but just in case
            if (launchToWrite == null) {
                const msg = Translator.t(STRING_NS, "noDebugTypeKnown", { type: project.type.type });
                Log.e(msg);
                throw new Error(msg);
            }

            Log.d("Pushing new debug launch: " + launchToWrite.name, launchToWrite);
            launchConfigs.push(launchToWrite);
        }

        await this.updateWorkspaceLaunchConfigs(workspaceConfig, launchConfigs);
        Log.d("Updated launch configs");
        // Logger.log("New config", launchConfig.get(CONFIGURATIONS));
        return launchToWrite;
    }

    private static readonly RQ_ATTACH: string = "attach";       // non-nls

    private static generateDebugLaunchConfig(debugName: string, project: Project): vscode.DebugConfiguration | undefined {

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
                    // User could change this in their dockerfile - but that would not fit with our import instructions
                    // https://microclimate-dev2ops.github.io/importedprojects#nodejs-projects
                    remoteRoot: "/app",         // non-nls
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
     *
     * @return Either the new, or existing, launch config depending on whether an update was necessary.
     */
    private static updateDebugLaunchConfig(project: Project, existingLaunch: vscode.DebugConfiguration): vscode.DebugConfiguration {
        let changed = false;
        const newLaunch: vscode.DebugConfiguration = existingLaunch;

        if (existingLaunch.port === newLaunch.port) {
            Log.d(`Debug port for ${project.name} didn't change`);
        }
        else {
            Log.d(`Debug port for ${project.name} changed from ${existingLaunch.port} to ${newLaunch.port}`);
            newLaunch.port = project.debugPort;
            changed = true;
        }

        return changed ? newLaunch : existingLaunch;
    }
}
