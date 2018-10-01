import * as vscode from "vscode";
import * as request from "request-promise-native";

import { TreeItemAdaptable, SimpleTreeItem } from "../../view/projectExplorer/TreeItemAdaptable";
import Project from "../project/Project";
import Endpoints from "../../constants/EndpointConstants";
import MCSocket from "./MCSocket";
import ConnectionManager from "./ConnectionManager";
import { triggerAsyncId } from "async_hooks";

export default class Connection implements TreeItemAdaptable {

    private static readonly CONTEXT_ID = "ext.mc.connectionItem";             // must match package.json

    private readonly socket: MCSocket;
    private readonly projectsApiUri: vscode.Uri;
    
    private projects: Project[] = [];
    private needProjectUpdate: Boolean = true;
    
    constructor (
        public readonly mcUri: vscode.Uri,
        public readonly host: string,
        public readonly workspacePath: vscode.Uri
    ) {
        this.projectsApiUri = Endpoints.getEndpointPath(mcUri, Endpoints.PROJECTS);
        this.socket = new MCSocket(mcUri.toString(), this);
    }

    async getProjects(): Promise<Project[]> {
        if (!this.needProjectUpdate) {
            return this.projects;
        }

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
        return this.projects;
    }

    async getChildren(): Promise<TreeItemAdaptable[]> {
        await this.getProjects();
        if (this.projects.length === 0) {
            return [ new SimpleTreeItem("No projects", vscode.TreeItemCollapsibleState.None, []) ];
        }
        return this.projects;
    }

    toTreeItem(): vscode.TreeItem {
        const ti: vscode.TreeItem = new vscode.TreeItem(this.mcUri.toString(), vscode.TreeItemCollapsibleState.Expanded);
        ti.resourceUri = this.workspacePath;
        ti.tooltip = ti.resourceUri.fsPath.toString();
        ti.contextValue = Connection.CONTEXT_ID;
        return ti;
    }

    public forceProjectUpdate() {
        console.log("ForceProjectUpdate");
        this.needProjectUpdate = true;
        this.getProjects();
    }

    public async requestProjectRestart(projectID: string, debug: Boolean): Promise<void> {
        const uri = Endpoints.getEndpointPath(this.mcUri, Endpoints.RESTART_ACTION(projectID));  
        const options = {
            json: true,
            body: {
                "startMode": debug ? "debug": "run"
            }
        };

        request.post(uri.toString(), options)
            .then( (result) => {
                console.log("Response from restart request:", result);
            })
            .catch( (err) => {
                console.error("Error POSTing restart request:", err);
            });
    }
}