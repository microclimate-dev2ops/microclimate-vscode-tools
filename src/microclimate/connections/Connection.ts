import { Uri, TreeItemCollapsibleState, TreeItem } from "vscode";
import * as request from "request-promise-native";

import { Project } from "./Project";
import { TreeItemAdaptable } from "../../view/projectExplorer/TreeItemAdaptable";
import * as path from 'path';

export class Connection implements TreeItemAdaptable {

    private static readonly PROJECTS_PATH = "api/v1/projects";

    private readonly projectsApiUri: Uri;
    
    constructor (
        public readonly mcUri: Uri,
        public readonly workspacePath: Uri
    ) {
        this.projectsApiUri = Uri.parse(mcUri.toString().concat(Connection.PROJECTS_PATH));
    }

    async getProjects(): Promise<Project[]> {
        const projects: Project[] = [];
        const result = await request.get(this.projectsApiUri.toString(), { json : true });
        
        for (const project of result) {
            const projectLoc: Uri = Uri.file(path.join(this.workspacePath.toString(), project.locOnDisk));
            projects.push(new Project(project.name, project.projectID, project.projectType, project.contextroot, projectLoc));
        }

        return projects;
    }

    getChildren(): Promise<TreeItemAdaptable[]> {
        return this.getProjects();
    }

    toTreeItem(): TreeItem {
        const ti = new TreeItem(this.mcUri.toString(), TreeItemCollapsibleState.Expanded);
        ti.resourceUri = this.workspacePath;

        return ti;
    }
}