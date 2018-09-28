import * as vscode from 'vscode';
import * as request from "request-promise-native";

import { TreeItemAdaptable, SimpleTreeItem } from "../../view/projectExplorer/TreeItemAdaptable";
import * as MCUtil from '../../MCUtil';
import { Project } from './Project';

export class Connection implements TreeItemAdaptable {

    private static readonly PROJECTS_PATH = "api/v1/projects";

    private static readonly CONTEXT_ID = "ext.mc.connectionItem";             // must match package.json

    private readonly projectsApiUri: vscode.Uri;
    
    constructor (
        public readonly mcUri: vscode.Uri,
        public readonly workspacePath: vscode.Uri
    ) {
        this.projectsApiUri = vscode.Uri.parse(mcUri.toString().concat(Connection.PROJECTS_PATH));
    }

    async getProjects(): Promise<TreeItemAdaptable[]> {
        const projects: TreeItemAdaptable[] = [];
        const result = await request.get(this.projectsApiUri.toString(), { json : true });
        
        for (const project of result) {
            const projectLocStr = MCUtil.appendPathWithoutDupe(this.workspacePath.fsPath, project.locOnDisk);
            // console.log("projectLocStr", projectLocStr);

            const projectLoc: vscode.Uri = vscode.Uri.file(projectLocStr);
            projects.push(new Project(project.name, project.projectID, project.projectType, project.contextroot, projectLoc));
        }

        return projects;
    }

    async getChildren(): Promise<TreeItemAdaptable[]> {
        const projects = await this.getProjects();
        if (projects.length == 0) {
            return [ new SimpleTreeItem("No projects", vscode.TreeItemCollapsibleState.None, []) ];
        }
        return projects;
    }

    toTreeItem(): vscode.TreeItem {
        const ti: vscode.TreeItem = new vscode.TreeItem(this.mcUri.toString(), vscode.TreeItemCollapsibleState.Expanded);
        ti.resourceUri = this.workspacePath;
        ti.contextValue = Connection.CONTEXT_ID;
        return ti;
    }
}