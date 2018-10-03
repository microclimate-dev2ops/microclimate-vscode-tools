import * as vscode from "vscode";
import * as request from "request-promise-native";

import TreeItemAdaptable, { SimpleTreeItem } from "../../view/projectExplorer/TreeItemAdaptable";
import Project from "../project/Project";
import Endpoints from "../../constants/EndpointConstants";
import MCSocket from "./MCSocket";
import ConnectionManager from "./ConnectionManager";
import { ProjectType } from "../project/ProjectType";
import { getIconObj } from "../../MCUtil";

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

    async getProjects(): Promise<Project[]> {
        if (!this.needProjectUpdate) {
            return this.projects;
        }
        console.log(`Updating projects list for ${this.mcUri}`);

        const result = await request.get(this.projectsApiUri.toString(), { json : true });

        this.projects = [];
        this.socket.projectStateCallbacks.clear();

        for (const projectInfo of result) {
            const newProject: Project = new Project(projectInfo, this);
            this.socket.projectStateCallbacks.set(newProject.id, newProject.setStatus);
            this.projects.push(newProject);
        }

        ConnectionManager.instance.onChange();
        this.needProjectUpdate = false;
        console.log("Done projects update");
        return this.projects;
    }

    async getChildren(): Promise<TreeItemAdaptable[]> {
        await this.getProjects();
        console.log(`Connection ${this.mcUri} has ${this.projects.length} projects`);
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
        ti.iconPath = getIconObj("connection.svg");
        return ti;
    }

    public async forceProjectUpdate(): Promise<void> {
        console.log("ForceProjectUpdate");
        this.needProjectUpdate = true;
        await this.getProjects();
    }

    public async requestProjectRestart(project: Project, debug: Boolean): Promise<void> {
        // TODO remove, Portal should tell us instead if it's invalid.
        if (project.type.type !== ProjectType.Types.MICROPROFILE) {
            vscode.window.showErrorMessage(`You can't restart ${project.type} projects yet`);
            return;
        }

        const uri = Endpoints.getEndpointPath(this.mcUri, Endpoints.RESTART_ACTION(project.id));
        const options = {
            json: true,
            body: {
                startMode: debug ? "debug": "run"
            }
        };

        // TODO this will always appear to succeed because https://github.ibm.com/dev-ex/portal/issues/523
        return request.post(uri.toString(), options)
            .then( (result) => {
                console.log("Response from restart request:", result);
                vscode.window.showInformationMessage(`Restarting ${project.name} into ${options.body.startMode} mode`);
            })
            .catch( (err) => {
                console.error("Error POSTing restart request:", err);
                vscode.window.showInformationMessage(`Restart failed: ${err}`);
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