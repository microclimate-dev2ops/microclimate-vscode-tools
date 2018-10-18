import * as vscode from "vscode";
import * as request from "request-promise-native";

import * as MCUtil from "../../MCUtil";
import TreeItemAdaptable, { SimpleTreeItem } from "../../view/TreeItemAdaptable";
import Project from "../project/Project";
import Endpoints from "../../constants/Endpoints";
import MCSocket from "./MCSocket";
import ConnectionManager from "./ConnectionManager";
import { Icons, getIconPaths } from "../../constants/Icons";

export default class Connection implements TreeItemAdaptable, vscode.QuickPickItem {

    private static readonly CONTEXT_ID: string = "ext.mc.connectionItem";             // must match package.json

    private readonly socket: MCSocket;
    private readonly projectsApiUri: vscode.Uri;

    // Has this connection ever been able to contact its Microclimate instance
    // private hasConnected = false;
    // Is this connection CURRENTLY connected to its Microclimate instance
    private connected: Boolean = false;

    private projects: Project[] = [];
    private needProjectUpdate: Boolean = true;

    // QuickPickItem
    public readonly label: string;
    public readonly description?: string;
    // public readonly detail?: string;

    constructor (
        public readonly mcUri: vscode.Uri,
        public readonly host: string,
        public readonly version: number,
        public readonly workspacePath: vscode.Uri
    ) {
        this.projectsApiUri = Endpoints.getEndpointPath(this, Endpoints.PROJECTS);
        this.socket = new MCSocket(mcUri.toString(), this);

        // QuickPickItem
        this.label = "Microclimate @ " + this.mcUri.toString();
        // this.description = this.workspacePath.fsPath.toString();
        console.log(`Created new Connection @ ${this.mcUri} - version ${this.version}, workspace ${this.workspacePath}`);
    }

    public toString(): string {
        return this.mcUri.toString();
    }

    /**
     * Call this whenever the tree needs to be updated - ie when this connection or any of its projects changes.
     */
    async onChange(): Promise<void> {
        ConnectionManager.instance.onChange();
    }

    public get isConnected(): Boolean {
        return this.connected;
    }

    onConnect = async (): Promise<void> => {
        console.log(`${this} onConnect`);
        /*
        if (!this.hasConnected) {
            console.log(`${this} formed initial connection`);
            this.hasConnected = true;
        }
        else */
        if (this.connected) {
            // we already know we're connected, nothing to do until we disconnect
            return;
        }
        this.connected = true;
        console.log(`${this} is now connected`);

        this.onChange();
    }

    onDisconnect = async (): Promise<void> => {
        console.log(`${this} onDisconnect`);
        if (!this.connected) {
            // we already know we're disconnected, nothing to do until we reconnect
            return;
        }
        this.connected = false;
        console.log(`${this} is now disconnected`);

        this.onChange();
    }

    async getProjects(): Promise<Project[]> {
        if (!this.needProjectUpdate) {
            return this.projects;
        }
        console.log(`Updating projects list for ${this.mcUri}`);

        const result = await request.get(this.projectsApiUri.toString(), { json : true });
        console.log("Get project list result:", result);

        this.projects = [];

        for (const projectInfo of result) {
            const newProject: Project = new Project(projectInfo, this);
            this.projects.push(newProject);
        }

        this.needProjectUpdate = false;
        console.log("Done projects update");
        return this.projects;
    }

    async getProjectByID(projectID: string): Promise<Project | undefined> {
        const result = (await this.getProjects()).find( (project) => project.id === projectID);
        if (result == null) {
            // console.error(`Couldn't find project with ID ${projectID} on connection ${this.mcUri}`);
        }
        return result;
    }

    public async getChildren(): Promise<TreeItemAdaptable[]> {
        if (!this.connected) {
            return [];
        }

        await this.getProjects();
        // console.log(`Connection ${this.mcUri} has ${this.projects.length} projects`);
        if (this.projects.length === 0) {
            const noProjectsTi: SimpleTreeItem = new SimpleTreeItem("No projects");
            return [ noProjectsTi ];
        }
        return this.projects;
    }

    public toTreeItem(): vscode.TreeItem {
        let tiLabel = `Microclimate @ ${this.mcUri.toString()}`;
        if (!this.connected) {
            tiLabel += " [Disconnected]";
        }
        const ti: vscode.TreeItem = new vscode.TreeItem(tiLabel, vscode.TreeItemCollapsibleState.Expanded);
        ti.resourceUri = this.workspacePath;
        ti.tooltip = ti.resourceUri.fsPath.toString();
        ti.contextValue = Connection.CONTEXT_ID;
        ti.iconPath = getIconPaths(Icons.Microclimate);
        // command run on single-click - https://github.com/Microsoft/vscode/issues/39601
        /*
        ti.command = {
            command: Project.ONCLICK_CMD_ID,
            title: "",
            arguments: [ti.resourceUri]
        };*/
        return ti;
    }

    public async forceProjectUpdate(): Promise<void> {
        console.log("ForceProjectUpdate");
        this.needProjectUpdate = true;
        await this.getProjects();
    }

    public async requestProjectRestart(project: Project, debug: Boolean): Promise<void> {
        const uri = Endpoints.getEndpointPath(this, Endpoints.RESTART_ACTION(project.id));
        const options = {
            json: true,
            body: {
                startMode: MCUtil.getStartMode(debug)
            }
        };

        request.post(uri.toString(), options)
            .then( (result) => {
                console.log("Response from restart request:", result);
                vscode.window.showInformationMessage(`Restarting ${project.name} into ${options.body.startMode} mode`);
            })
            .catch( (err) => {
                const errMsg = err.error ? err.error : err;
                console.log("Error POSTing restart request:", errMsg);

                if (err.statusCode !== 400) {
                    console.error("Unexpected error POSTing restart request", err);
                }

                vscode.window.showErrorMessage(`Restart failed: ${errMsg}`);
            });
    }

    public async requestBuild(project: Project): Promise<void> {
        const uri = Endpoints.getEndpointPath(this, Endpoints.BUILD_ACTION(project.id));
        const options = {
            json: true,
            body: {
                action: "build"
            }
        };

        request.post(uri.toString(), options)
            .then( (result) => {
                console.log(`Response from build request for ${project.name}:`, result);
                vscode.window.showInformationMessage(`Build requested for ${project.name}`);
            })
            .catch( (err) => {
                console.log(`Error POSTing build request`, err);
                vscode.window.showErrorMessage(`Build request failed: ${err}`);
            });
    }

    public async toggleEnablement(project: Project): Promise<void> {
        const newEnablement: Boolean = !project.state.isEnabled;
        const newEnablementStr: string = newEnablement ? "Enable" : "Disable";

        const uri = Endpoints.getEndpointPath(this, Endpoints.ENABLEMENT_ACTION(project.id, newEnablement));
        console.log("Enablement uri is ", uri.toString());

        request.put(uri.toString(), { json: true })
            .then( (result) => {
                console.log(`Response from enablement request for ${project.name}:`, result);
                vscode.window.showInformationMessage(`Requested to ${newEnablementStr.toLowerCase()} ${project.name}`);
            })
            .catch( (err) => {
                console.error(`Error POSTing enablement request`, err);
                vscode.window.showErrorMessage(`${newEnablementStr} request failed: ${err}`);
            });
    }
}