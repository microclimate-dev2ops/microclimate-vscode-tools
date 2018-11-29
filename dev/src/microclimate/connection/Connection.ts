import * as vscode from "vscode";
import * as request from "request-promise-native";

import ITreeItemAdaptable, { SimpleTreeItem } from "../../view/TreeItemAdaptable";
import Project from "../project/Project";
import Endpoints from "../../constants/Endpoints";
import MCSocket from "./MCSocket";
import ConnectionManager from "./ConnectionManager";
import { Icons, getIconPaths } from "../../constants/Resources";
import Log from "../../Logger";
import MCLogManager from "../logs/MCLogManager";
import DebugUtils from "../project/DebugUtils";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";

export default class Connection implements ITreeItemAdaptable, vscode.QuickPickItem {

    private static readonly CONTEXT_ID: string = "ext.mc.connectionItem";       // must match package.nls.json    // non-nls
    private static readonly CONTEXT_ID_ACTIVE: string = Connection.CONTEXT_ID + ".active";      // non-nls

    public readonly socket: MCSocket;

    public readonly logManager: MCLogManager;

    private readonly projectsApiUri: string;

    // Has this connection ever been able to contact its Microclimate instance
    // private hasConnected = false;
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
        public readonly workspacePath: vscode.Uri
    ) {
        this.projectsApiUri = Endpoints.getEndpoint(this, Endpoints.PROJECTS);
        this.socket = new MCSocket(mcUri.toString(), this);
        this.logManager = new MCLogManager(this);

        // QuickPickItem
        this.label = this.getTreeItemLabel();
        // this.description = this.workspacePath.fsPath.toString();
        Log.i(`Created new Connection @ ${this.mcUri} - version ${this.version}, workspace ${this.workspacePath}`);
        DebugUtils.cleanDebugLaunchConfigsFor(this);
    }

    public async destroy(): Promise<void> {
        Log.d("Destroy connection " + this);
        this.logManager.onConnectionDisconnect();
        return this.socket.destroy();
    }

    public toString(): string {
        return this.mcUri.toString();
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
        this.connected = true;
        Log.d(`${this} is now connected`);
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
        Log.d(`${this} is now disconnected`);
        this.logManager.onConnectionDisconnect();

        this.onChange();
    }

    public async getProjects(): Promise<Project[]> {
        // Log.d("getProjects");
        if (!this.needProjectUpdate) {
            return this.projects;
        }
        Log.d(`Updating projects list from ${this.mcUri}`);

        const result = await request.get(this.projectsApiUri, { json : true });
        Log.d("Get project list result:", result);

        const oldProjects = this.projects;
        this.projects = [];

        for (const projectInfo of result) {
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
            // Logger.logE(`Couldn't find project with ID ${projectID} on connection ${this.mcUri}`);
        }
        return result;
    }

    public async getChildren(): Promise<ITreeItemAdaptable[]> {
        if (!this.connected) {
            // The context ID can be any truthy string.
            const disconnectedLabel = "❌  " + Translator.t(StringNamespaces.TREEVIEW, "disconnectedConnectionLabel");
            const disconnectedContextID = "disconnectedContextID"; // non-nls;
            const disconnectedTI = new SimpleTreeItem(disconnectedLabel, undefined, undefined, disconnectedContextID);
            return [ disconnectedTI ];
        }

        await this.getProjects();
        // Logger.log(`Connection ${this.mcUri} has ${this.projects.length} projects`);
        if (this.projects.length === 0) {
            const noProjectsTi: SimpleTreeItem = new SimpleTreeItem(Translator.t(StringNamespaces.TREEVIEW, "noProjectsLabel"));
            return [ noProjectsTi ];
        }
        return this.projects;
    }

    public toTreeItem(): vscode.TreeItem {
        const ti: vscode.TreeItem = new vscode.TreeItem(this.getTreeItemLabel(), vscode.TreeItemCollapsibleState.Expanded);
        // ti.resourceUri = this.workspacePath;
        ti.tooltip = this.workspacePath.fsPath.toString();
        ti.contextValue = this.getContextID();
        ti.iconPath = getIconPaths(Icons.Microclimate);
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

    public async forceUpdateProjectList(): Promise<void> {
        Log.d("forceUpdateProjectList");
        this.needProjectUpdate = true;
        this.getProjects();
    }
}
