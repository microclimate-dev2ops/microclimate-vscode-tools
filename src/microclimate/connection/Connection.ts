import * as vscode from "vscode";
import * as request from "request-promise-native";

import { TreeItemAdaptable, SimpleTreeItem } from "../../view/projectExplorer/TreeItemAdaptable";
import * as MCUtil from "../../MCUtil";
import Project from "../project/Project";
import Endpoints from "../../constants/EndpointConstants";
import MCSocket from "./MCSocket";

export default class Connection implements TreeItemAdaptable {

    private static readonly CONTEXT_ID = "ext.mc.connectionItem";             // must match package.json

    private readonly projectsApiUri: vscode.Uri;
    private readonly socket: MCSocket;
    
    constructor (
        public readonly mcUri: vscode.Uri,
        public readonly workspacePath: vscode.Uri
    ) {
        this.projectsApiUri = vscode.Uri.parse(mcUri.toString().concat(Endpoints.PROJECTS));
        this.socket = new MCSocket(mcUri.toString());
    }

    async getProjects(): Promise<TreeItemAdaptable[]> {
        const projects: TreeItemAdaptable[] = [];
        const result = await request.get(this.projectsApiUri.toString(), { json : true });
        
        for (const project of result) {
            const projectLocStr = MCUtil.appendPathWithoutDupe(this.workspacePath.fsPath, project.locOnDisk);
            const projectLoc: vscode.Uri = vscode.Uri.file(projectLocStr);
            projects.push(new Project(project, projectLoc));
        }

        return projects;
    }

    async getChildren(): Promise<TreeItemAdaptable[]> {
        const projects = await this.getProjects();
        if (projects.length === 0) {
            return [ new SimpleTreeItem("No projects", vscode.TreeItemCollapsibleState.None, []) ];
        }
        return projects;
    }

    toTreeItem(): vscode.TreeItem {
        const ti: vscode.TreeItem = new vscode.TreeItem(this.mcUri.toString(), vscode.TreeItemCollapsibleState.Expanded);
        ti.resourceUri = this.workspacePath;
        ti.tooltip = ti.resourceUri.fsPath.toString();
        ti.contextValue = Connection.CONTEXT_ID;
        return ti;
    }
}