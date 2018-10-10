import * as vscode from "vscode";
import * as request from "request-promise-native";

import * as MCUtil from "../../MCUtil";
import TreeItemAdaptable, { SimpleTreeItem } from "../../view/projectExplorer/TreeItemAdaptable";
import Project from "../project/Project";
import Endpoints from "../../constants/EndpointConstants";
import MCSocket from "./MCSocket";
import ConnectionManager from "./ConnectionManager";
import { ProjectType } from "../project/ProjectType";

export default class Connection implements TreeItemAdaptable, vscode.QuickPickItem {

    private static readonly CONTEXT_ID = "ext.mc.connectionItem";             // must match package.json

    private readonly socket: MCSocket;
    private readonly projectsApiUri: vscode.Uri;

    private projects: Project[] = [];
    private needProjectUpdate: Boolean = true;

    // QuickPickItem
    public readonly label: string;
    public readonly description?: string;
    // public readonly detail?: string;

    constructor (
        public readonly mcUri: vscode.Uri,
        public readonly host: string,
        public readonly workspacePath: vscode.Uri
    ) {
        this.projectsApiUri = Endpoints.getEndpointPath(mcUri, Endpoints.PROJECTS);
        this.socket = new MCSocket(mcUri.toString(), this);

        // QuickPickItem
        this.label = "Microclimate @ " + this.mcUri.toString();
        // this.description = this.workspacePath.fsPath.toString();
    }

    async onChange(): Promise<void> {
        ConnectionManager.instance.onChange(this);
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

    async getChildren(): Promise<TreeItemAdaptable[]> {
        await this.getProjects();
        // console.log(`Connection ${this.mcUri} has ${this.projects.length} projects`);
        if (this.projects.length === 0) {
            return [ new SimpleTreeItem("No projects") ];
        }
        return this.projects;
    }

    toTreeItem(): vscode.TreeItem {
        const ti: vscode.TreeItem = new vscode.TreeItem(this.mcUri.toString(), vscode.TreeItemCollapsibleState.Expanded);
        ti.resourceUri = this.workspacePath;
        ti.tooltip = ti.resourceUri.fsPath.toString();
        ti.contextValue = Connection.CONTEXT_ID;
        ti.iconPath = MCUtil.getIconObj("connection.svg");
        return ti;
    }

    public async forceProjectUpdate(): Promise<void> {
        console.log("ForceProjectUpdate");
        this.needProjectUpdate = true;
        await this.getProjects();
    }

    public async requestProjectRestart(project: Project, debug: Boolean): Promise<void> {
        const uri = Endpoints.getEndpointPath(this.mcUri, Endpoints.RESTART_ACTION(project.id));
        const options = {
            json: true,
            body: {
                startMode: MCUtil.getStartMode(debug)
            }
        };

        // TODO this will always appear to succeed because https://github.ibm.com/dev-ex/portal/issues/523
        return request.post(uri.toString(), options)
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
        const uri = Endpoints.getEndpointPath(this.mcUri, Endpoints.BUILD_ACTION(project.id));
        const options = {
            json: true,
            body: {
                action: "build"
            }
        };

        return request.post(uri.toString(), options)
            .then( (result) => {
                console.log(`Response from build request for ${project.name}:`, result);
                vscode.window.showInformationMessage(`Build requested for ${project.name}`);
            })
            .catch( (err) => {
                console.log(`Error POSTing build request`, err);
                vscode.window.showErrorMessage(`Build request failed: ${err}`);
            });
    }
}