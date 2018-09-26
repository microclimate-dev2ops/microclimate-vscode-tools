import { Uri, TreeItemCollapsibleState } from "vscode";
import * as request from "request-promise-native";

import { Project } from "./Project";
import { MCTreeNode } from "../../view//projectExplorer/MCTreeNode";

export class Connection implements MCTreeNode {

    private static readonly PROJECTS_PATH = "api/v1/projects";

    private readonly projectsUri: Uri;

    readonly label: string;
    readonly initCollapsedState: TreeItemCollapsibleState;
    
    constructor (
        public readonly uri: Uri,
        public readonly workspacePath: Uri
    ) {
        this.projectsUri = Uri.parse(uri.toString().concat(Connection.PROJECTS_PATH));

        this.label = uri.toString();
        this.initCollapsedState = TreeItemCollapsibleState.Expanded;
    }

    async getProjects(): Promise<Project[]> {
        const projects: Project[] = [];
        const result = await request.get(this.projectsUri.toString(), { json : true });
        
        for (const project of result) {
            projects.push(new Project(project.name, project.projectID, project.projectType, project.contextroot, Uri.file(project.locOnDisk)));
        }

        return projects;
    }

    getChildren(): Promise<MCTreeNode[]> {
        return this.getProjects();
    }
}