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

import * as MCUtil from "../../MCUtil";
import ITreeItemAdaptable, { SimpleTreeItem } from "../../view/TreeItemAdaptable";
import Project from "../project/Project";
import Endpoints from "../../constants/Endpoints";
import MCSocket from "./MCSocket";
import ConnectionManager from "./ConnectionManager";
import Resources from "../../constants/Resources";
import Log from "../../Logger";
import MCLogManager from "../logs/MCLogManager";
import DebugUtils from "../project/DebugUtils";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Requester from "../project/Requester";
import MCEnvironment from "./MCEnvironment";
import Commands from "../../constants/Commands";
import { IConnectionData } from "./ConnectionData";

export default class Connection implements ITreeItemAdaptable, vscode.QuickPickItem {

    private static readonly CONTEXT_ID: string = "ext.mc.connectionItem";       // must match package.nls.json    // non-nls
    private static readonly CONTEXT_SUFFIX_ACTIVE:  string = "active";     // non-nls
    private static readonly CONTEXT_SUFFIX_ICP:     string = "icp";        // non-nls

    /**
     *  For ICP connections, this is the INGRESS url.
     */
    public readonly mcUrl: vscode.Uri;
    // public readonly masterIP: string;
    private readonly projectsApiUrl: vscode.Uri;
    public readonly host: string;
    public readonly isICP: boolean;

    public readonly user: string;
    public readonly workspacePath: vscode.Uri;
    public readonly version: number;
    public readonly versionStr: string;

    public readonly socketNamespace: string;
    public readonly socket: MCSocket;

    public readonly logManager: MCLogManager;

    // Has this connection EVER connected to its Microclimate instance
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
        connectionData: IConnectionData
    ) {
        this.mcUrl = connectionData.url;
        this.projectsApiUrl = Endpoints.getEndpoint(this, Endpoints.PROJECTS);
        this.socketNamespace = connectionData.socketNamespace;
        this.user = connectionData.user;
        this.version = connectionData.version;
        this.socket = new MCSocket(this, connectionData.socketNamespace);
        this.logManager = new MCLogManager(this);
        this.host = MCUtil.getHostnameFromAuthority(this.mcUrl.authority);
        this.isICP = !MCUtil.isLocalhost(this.host);
        this.workspacePath = vscode.Uri.file(connectionData.workspacePath);
        this.versionStr = MCEnvironment.getVersionAsString(connectionData.version);

        // QuickPickItem
        this.label = this.getTreeItemLabel();
        // this.description = this.workspacePath.fsPath.toString();
        Log.i(`Created new Connection @ ${this}, workspace ${this.workspacePath}`);
        DebugUtils.cleanDebugLaunchConfigsFor(this);
    }

    public async destroy(skipLogout: boolean = false): Promise<void> {
        Log.d("Destroy connection " + this);

        // logout only necessary (and posssible) for icp connections
        const logoutPromise = this.isICP && !skipLogout ?
            vscode.commands.executeCommand(Commands.LOGOUT_CONNECTION).then(() => Promise.resolve()) :
            Promise.resolve();

        return Promise.all([
            this.logManager.onConnectionDisconnect(),
            this.socket.destroy(),
            logoutPromise,
        ])
        .then( () => {
            Log.d("Destroyed " + this);
        });
    }

    public toString(): string {
        return `${this.mcUrl}`;
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

        // Don't bother verifying reconnect if this is an initial connection
        if (this.hasConnected && !(await ConnectionManager.instance.verifyReconnect(this))) {
            Log.i(`Connection has changed on reconnect! ${this} is no longer a valid Connection`);
            // this connection gets destroyed
            return;
        }

        this.hasConnected = true;
        this.connected = true;
        Log.d(`${this} is now connected`);
        await this.forceUpdateProjectList();
        this.logManager.onConnectionReconnect();

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
        this.logManager.onConnectionDisconnect();

        this.onChange();
    }

    public async getProjects(): Promise<Project[]> {
        // Log.d("getProjects");
        if (!this.needProjectUpdate) {
            return this.projects;
        }

        if (!this.isConnected) {
            return [];
        }

        Log.d(`Updating projects list from ${this}`);

        let projectsResponse: request.FullResponse;
        try {
            projectsResponse = await Requester.get(this.projectsApiUrl, { json: true });

            if (!Array.isArray(projectsResponse.body)) {
                const errMsg = `Unexpected response from ${projectsResponse.request.uri}`;
                Log.e(errMsg, projectsResponse.body);
                throw new Error(errMsg);
            }
        }
        catch (err) {
            Log.e(`Error updating projects list from ${this.projectsApiUrl}:`, err);
            vscode.window.showErrorMessage(`Error updating projects list from ${this.mcUrl}: ${err.message || err}`);
            this.onDisconnect();
            return this.projects;
        }

        // by now we know that we got a JSON array response from the server, so we can proceed to treat it as projects.
        Log.d("Get project list result:", projectsResponse.body);

        const oldProjects = this.projects;
        this.projects = [];

        for (const projectInfo of projectsResponse.body) {
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
        return (await this.getProjects()).find( (project) => project.id === projectID);
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
        ti.tooltip = `${this.workspacePath.fsPath}`;
        ti.contextValue = this.getContextID();
        ti.iconPath = Resources.getIconPaths(Resources.Icons.Microclimate);
        // command run on single-click - https://github.com/Microsoft/vscode/issues/39601
        // ti.command = {
        //     command: Commands.REFRESH_CONNECTION,
        //     arguments: [ this ],
        //     title: "Refresh",
        // };

        return ti;
    }

    private getTreeItemLabel(): string {
        // return Translator.t(StringNamespaces.TREEVIEW, "connectionLabel", { uri: this.mcUri });
        // const userStr = this.user ? `${this.user}@` : "";
        // return `${userStr}${this.mcUrl.authority} • ${this.versionStr}`;
        return `${this.mcUrl.authority} • ${this.versionStr}`;
    }

    private getContextID(): string {
        const SEP = ".";
        let contextID = Connection.CONTEXT_ID;
        if (this.connected) {
            contextID += SEP + Connection.CONTEXT_SUFFIX_ACTIVE;
        }
        if (this.isICP) {
            contextID += SEP + Connection.CONTEXT_SUFFIX_ICP;
        }
        return contextID;
    }

    public async forceUpdateProjectList(): Promise<void> {
        Log.d("forceUpdateProjectList");
        // if (wipeProjects) {
        //     Log.d(`Connection ${this} wiping ${this.projects.length} projects`);
        //     this.projects = [];
        // }
        this.needProjectUpdate = true;
        this.getProjects();
    }
}
