import * as vscode from "vscode";
import * as request from "request-promise-native";

import { TreeItemAdaptable, SimpleTreeItem } from "../../view/projectExplorer/TreeItemAdaptable";
import * as MCUtil from "../../MCUtil";
import Project from "../project/Project";
import Endpoints from "../../constants/EndpointConstants";
import MCSocket from "./MCSocket";
import ConnectionManager from "./ConnectionManager";

export default class Connection implements TreeItemAdaptable {

    private static readonly CONTEXT_ID = "ext.mc.connectionItem";             // must match package.json

    private readonly socket: MCSocket;
    private readonly projectsApiUri: vscode.Uri;
    
    private projects: Project[] = [];
    private needProjectUpdate: Boolean = true;
    
    constructor (
        public readonly mcUri: vscode.Uri,
        public readonly workspacePath: vscode.Uri
    ) {
        this.projectsApiUri = vscode.Uri.parse(mcUri.toString().concat(Endpoints.PROJECTS));
        this.socket = new MCSocket(mcUri.toString(), this);
    }

    async updateProjects(): Promise<TreeItemAdaptable[]> {
        if (!this.needProjectUpdate) {
            return this.projects;
        }

        const result = await request.get(this.projectsApiUri.toString(), { json : true });
        
        this.projects = [];
        this.socket.projectStateCallbacks.clear();

        for (const projectInfo of result) {
            const projectLocStr = MCUtil.appendPathWithoutDupe(this.workspacePath.fsPath, projectInfo.locOnDisk);
            const projectLoc: vscode.Uri = vscode.Uri.file(projectLocStr);

            const newProject: Project = new Project(projectInfo, projectLoc);
            this.socket.projectStateCallbacks.set(newProject.id, newProject.setStatus);
            this.projects.push(newProject);
        }

        ConnectionManager.instance.onChange();
        this.needProjectUpdate = false;
        return this.projects;
    }

    async getChildren(): Promise<TreeItemAdaptable[]> {
        await this.updateProjects();
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
        this.updateProjects();
    }
}