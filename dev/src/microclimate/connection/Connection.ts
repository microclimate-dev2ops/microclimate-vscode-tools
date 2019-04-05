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
import * as request from "request-promise-native";

import ITreeItemAdaptable, { SimpleTreeItem } from "../../view/TreeItemAdaptable";
import Project from "../project/Project";
import { MCEndpoints, EndpointUtil } from "../../constants/Endpoints";
import MCSocket from "./MCSocket";
import ConnectionManager from "./ConnectionManager";
import Resources from "../../constants/Resources";
import Log from "../../Logger";
import DebugUtils from "../project/DebugUtils";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import MCEnvironment from "./MCEnvironment";

export default class Connection implements ITreeItemAdaptable, vscode.QuickPickItem {

    private static readonly CONTEXT_ID: string = "ext.mc.connectionItem";       // must match package.nls.json    // non-nls
    private static readonly CONTEXT_ID_ACTIVE: string = Connection.CONTEXT_ID + ".active";      // non-nls

    public readonly workspacePath: vscode.Uri;
    public readonly versionStr: string;

    public readonly socket: MCSocket;

    private hasConnected: boolean = false;
    // Is this connection CURRENTLY connected to its Microclimate instance
    private connected: boolean = false;

    private projects: Project[] = [];
    private needProjectUpdate: boolean = true;

    // QuickPickItem
    public readonly label: string;
    public readonly description?: string;
    // public readonly detail?: string;

    constructor(
        public readonly mcUri: vscode.Uri,
        public readonly host: string,
        public readonly version: number,
        public readonly socketNS: string,
        workspacePath_: string
    ) {
        this.socket = new MCSocket(this, socketNS);
        this.workspacePath = vscode.Uri.file(workspacePath_);
        this.versionStr = MCEnvironment.getVersionAsString(version);

        // QuickPickItem
        this.label = this.getTreeItemLabel();
        // this.description = this.workspacePath.fsPath.toString();
        Log.i(`Created new Connection @ ${this}, workspace ${this.workspacePath}`);
        DebugUtils.cleanDebugLaunchConfigsFor(this);
    }

    public async destroy(): Promise<void> {
        Log.d("Destroy connection " + this);
        return Promise.all([
            this.socket.destroy()
        ])
        .then(() => Promise.resolve());
    }

    public toString(): string {
        return `${this.mcUri} ${this.versionStr}`;
    }

    /**
     * Call this whenever the tree needs to be updated - ie when this connection or any of its projects changes.
     */
    public async onChange(): Promise<void> {
        // Log.d(`Connection ${this.mcUri} changed`);
        ConnectionManager.instance.onChange();
    }

    public get isConnected(): boolean {
        return this.connected;
    }

    public onConnect = async (): Promise<void> => {
        Log.d(`${this} onConnect`);
        if (this.connected) {
            // we already know we're connected, nothing to do until we disconnect
            return;
        }

        if (!(await ConnectionManager.instance.verifyReconnect(this))) {
            Log.i(`Connection has changed on reconnect! ${this} is no longer a valid Connection`);
            // this connection gets destroyed
            return;
        }

        if (this.hasConnected) {
            // things to do on reconnect, but not initial connect, go here
            this.projects.forEach((p) => p.onConnectionReconnect());
        }
        this.hasConnected = true;
        this.connected = true;
        Log.d(`${this} is now connected`);
        await this.forceUpdateProjectList();

        this.onChange();
    }

    public onDisconnect = async (): Promise<void> => {
        Log.d(`${this} onDisconnect`);
        if (!this.connected) {
            // we already know we're disconnected, nothing to do until we reconnect
            return;
        }
        this.connected = false;

        this.projects.forEach((p) => p.onConnectionDisconnect());
        this.projects = [];

        Log.d(`${this} is now disconnected`);

        this.onChange();
    }

    public async getProjects(): Promise<Project[]> {
        // Log.d("getProjects");
        if (!this.needProjectUpdate) {
            return this.projects;
        }
        Log.d(`Updating projects list from ${this}`);

        const projectsUrl = EndpointUtil.resolveMCEndpoint(this, MCEndpoints.PROJECTS);
        const result = await request.get(projectsUrl, { json : true });

        const oldProjects = this.projects;
        this.projects = [];

        for (const projectInfo of result) {
            // This is a hard-coded exception for a Microclimate bug, where projects get stuck in the Deleting or Validating state
            // and don't go away until they're deleted from the workspace and MC is restarted.
            if (projectInfo.action === "deleting" || projectInfo.action === "validating") {     // non-nls
                Log.e("Project is in a bad state and won't be displayed:", projectInfo);
                continue;
            }

            let project: Project;

            // If we already have a Project object for this project, just update it, don't make a new object
            // (since then the old object will go stale while code might still be referencing it)
            const existing = oldProjects.find( (p) => p.id === projectInfo.projectID);

            if (existing != null) {
                project = existing;
                existing.update(projectInfo);
                // Log.d("Reuse project " + project.name);
            }
            else {
                project = new Project(projectInfo, this);
                Log.d("New project " + project.name);
            }
            this.projects.push(project);
        }

        this.needProjectUpdate = false;
        Log.d("Done projects update");
        return this.projects;
    }

    public async getProjectByID(projectID: string): Promise<Project | undefined> {
        const result = (await this.getProjects()).find( (project) => project.id === projectID);
        if (result == null) {
            // Logger.logE(`Couldn't find project with ID ${projectID} on connection ${this}`);
        }
        return result;
    }

    public async getChildren(): Promise<ITreeItemAdaptable[]> {
        if (!this.connected) {
            const disconnectedLabel = Translator.t(StringNamespaces.TREEVIEW, "disconnectedConnectionLabel");
            // The context ID can be any truthy string.
            const disconnectedContextID = "disconnectedContextID"; // non-nls;
            const disconnectedTI = new SimpleTreeItem(
                disconnectedLabel, undefined, undefined, disconnectedContextID, Resources.getIconPaths(Resources.Icons.Disconnected)
            );
            return [ disconnectedTI ];
        }

        await this.getProjects();
        // Logger.log(`Connection ${this} has ${this.projects.length} projects`);
        if (this.projects.length === 0) {
            const noProjectsTi: SimpleTreeItem = new SimpleTreeItem(Translator.t(StringNamespaces.TREEVIEW, "noProjectsLabel"));
            return [ noProjectsTi ];
        }
        return this.projects;
    }

    public toTreeItem(): vscode.TreeItem {
        const ti: vscode.TreeItem = new vscode.TreeItem(this.getTreeItemLabel(), vscode.TreeItemCollapsibleState.Expanded);
        // ti.resourceUri = this.workspacePath;
        ti.tooltip = `${this.versionStr} • ${this.workspacePath.fsPath}`;
        ti.contextValue = this.getContextID();
        ti.iconPath = Resources.getIconPaths(Resources.Icons.Microclimate);
        // command run on single-click - https://github.com/Microsoft/vscode/issues/39601
        /*
        ti.command = {
            command: Project.ONCLICK_CMD_ID,
            title: "",      // non-nls
            arguments: [ti.resourceUri]
        };*/
        return ti;
    }

    private getTreeItemLabel(): string {
        return Translator.t(StringNamespaces.TREEVIEW, "connectionLabel", { uri: this.mcUri });
    }

    private getContextID(): string {
        if (this.connected) {
            return Connection.CONTEXT_ID_ACTIVE;
        }
        return Connection.CONTEXT_ID;
    }

    public async forceUpdateProjectList(wipeProjects: boolean = false): Promise<void> {
        Log.d("forceUpdateProjectList");
        if (wipeProjects) {
            Log.d(`Connection ${this} wiping ${this.projects.length} projects`);
            this.projects = [];
        }
        this.needProjectUpdate = true;
        this.getProjects();
    }

    /**
     * Microclimate 1905 added:
     * - multi-logs
     * - project settings
     * - app monitor enablement
     */
    public is1905OrNewer(): boolean {
        return this.version >= 1905;
    }
}
