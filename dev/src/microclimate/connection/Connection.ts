import * as vscode from "vscode";
import * as request from "request-promise-native";

import * as MCUtil from "../../MCUtil";
import TreeItemAdaptable, { SimpleTreeItem } from "../../view/TreeItemAdaptable";
import Project from "../project/Project";
import Endpoints from "../../constants/Endpoints";
import MCSocket from "./MCSocket";
import ConnectionManager from "./ConnectionManager";
import { Icons, getIconPaths } from "../../constants/Resources";
import { Logger } from "../../Logger";

export default class Connection implements TreeItemAdaptable, vscode.QuickPickItem {

    private static readonly CONTEXT_ID: string = "ext.mc.connectionItem";             // must match package.json

    public readonly socket: MCSocket;

    private readonly projectsApiUri: string;

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
        this.projectsApiUri = Endpoints.getEndpoint(this, Endpoints.PROJECTS);
        this.socket = new MCSocket(mcUri.toString(), this);

        // QuickPickItem
        this.label = "Microclimate @ " + this.mcUri.toString();
        // this.description = this.workspacePath.fsPath.toString();
        Logger.log(`Created new Connection @ ${this.mcUri} - version ${this.version}, workspace ${this.workspacePath}`);
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
        Logger.log(`${this} onConnect`);
        /*
        if (!this.hasConnected) {
            Logger.log(`${this} formed initial connection`);
            this.hasConnected = true;
        }
        else */
        if (this.connected) {
            // we already know we're connected, nothing to do until we disconnect
            return;
        }
        this.connected = true;
        Logger.log(`${this} is now connected`);

        this.onChange();
    }

    onDisconnect = async (): Promise<void> => {
        Logger.log(`${this} onDisconnect`);
        if (!this.connected) {
            // we already know we're disconnected, nothing to do until we reconnect
            return;
        }
        this.connected = false;
        Logger.log(`${this} is now disconnected`);

        this.onChange();
    }

    async getProjects(): Promise<Project[]> {
        if (!this.needProjectUpdate) {
            return this.projects;
        }
        Logger.log(`Updating projects list for ${this.mcUri}`);

        const result = await request.get(this.projectsApiUri, { json : true });
        Logger.log("Get project list result:", result);

        this.projects = [];

        for (const projectInfo of result) {
            const newProject: Project = new Project(projectInfo, this);
            this.projects.push(newProject);
        }

        this.needProjectUpdate = false;
        Logger.log("Done projects update");
        return this.projects;
    }

    async getProjectByID(projectID: string): Promise<Project | undefined> {
        const result = (await this.getProjects()).find( (project) => project.id === projectID);
        if (result == null) {
            // Logger.logE(`Couldn't find project with ID ${projectID} on connection ${this.mcUri}`);
        }
        return result;
    }

    public async getChildren(): Promise<TreeItemAdaptable[]> {
        if (!this.connected) {
            return [];
        }

        await this.getProjects();
        // Logger.log(`Connection ${this.mcUri} has ${this.projects.length} projects`);
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

    public async forceUpdateProjectList(): Promise<void> {
        Logger.log("forceUpdateProjectList");
        this.needProjectUpdate = true;
        await this.getProjects();
    }

    public static async requestProjectRestart(project: Project, debug: Boolean): Promise<request.RequestPromise<any>> {
        const body = {
            startMode: MCUtil.getStartMode(debug)
        };

        const url = Endpoints.getProjectEndpoint(project.connection, project.id, Endpoints.RESTART_ACTION);
        return this.doProjectRequest(project, url, body, request.post, `Restart into ${body.startMode} mode`);
    }

    public static async requestBuild(project: Project): Promise<void> {
        const body = {
            action: "build"
        };

        const url = Endpoints.getProjectEndpoint(project.connection, project.id, Endpoints.BUILD_ACTION);
        this.doProjectRequest(project, url, body, request.post, "Build");

        // This is a workaround for the Build action not refreshing validation state.
        // Will be fixed by https://github.ibm.com/dev-ex/iterative-dev/issues/530
        return this.requestValidate(project);
    }

    public static async requestToggleAutoBuild(project: Project): Promise<void> {
        const newAutoBuild: Boolean = !project.autoBuildEnabled;
        // user-friendly action
        const newAutoBuildUserStr:  string = newAutoBuild ? "Enable auto build" : "Disable auto build";
        // action we'll put into the request body   https://github.ibm.com/dev-ex/portal/wiki/API:-Build
        const newAutoBuildAction:   string = newAutoBuild ? "enableautobuild" : "disableautobuild";

        const body = {
            "action": newAutoBuildAction
        };

        const url = Endpoints.getProjectEndpoint(project.connection, project.id, Endpoints.BUILD_ACTION);
        return this.doProjectRequest(project, url, body, request.post, newAutoBuildUserStr)
            .then( (result: any) => {
                if (result != null && result.statusCode === 200) {
                    project.setAutoBuild(newAutoBuild);
                }
            });
    }

    public static async requestToggleEnablement(project: Project): Promise<void> {
        const newEnablement: Boolean = !project.state.isEnabled;
        const newEnablementStr: string = newEnablement ? "Enable" : "Disable";

        const url = Endpoints.getProjectEndpoint(project.connection, project.id, Endpoints.ENABLEMENT_ACTION(newEnablement));
        return this.doProjectRequest(project, url, {}, request.put, newEnablementStr);
    }

    public static async requestValidate(project: Project): Promise<void> {
        const body = {
            projectID: project.id,
            projectType: project.type.internalType
        };

        const url = Endpoints.getEndpoint(project.connection, Endpoints.VALIDATE_ACTION);
        return this.doProjectRequest(project, url, body, request.post, "Validate");
    }

    public static async requestGenerate(project: Project): Promise<void> {
        const body = {
            projectID: project.id,
            projectType: project.type.internalType,
            autoGenerate: true
        };

        const url = Endpoints.getEndpoint(project.connection, Endpoints.GENERATE_ACTION);
        return this.doProjectRequest(project, url, body, request.post, "Generate");
    }

    private static doProjectRequest(project: Project, url: string, body: {},
            requestFunc: (uri: string, {}) => request.RequestPromise<any>,
            userOperationName: string
    ): any {
        Logger.log(`Doing ${userOperationName} request to ${url}`);

        const options = {
            json: true,
            body: body,

            resolveWithFullResponse: true
        }

        return requestFunc(url, options)
            .then( (result: any) => {
                Logger.log(`Response code ${result.statusCode} from ${userOperationName} request for ${project.name}:`, result);
                vscode.window.showInformationMessage(`${userOperationName} requested for ${project.name}`);
                return result;
            })
            .catch( (err: any) => {
                Logger.log(`Error doing ${userOperationName} project request for ${project.name}:`, err);

                // If the server provided a specific message, present the user with that,
                // otherwise show them the whole error (but it will be ugly)
                const errMsg = err.error ? err.error : err;
                vscode.window.showErrorMessage(`${userOperationName} failed: ${errMsg}`);
                return err;
            });
    }
}