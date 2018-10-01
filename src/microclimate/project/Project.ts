import * as vscode from "vscode";
import { TreeItemAdaptable } from "../../view/projectExplorer/TreeItemAdaptable";
import { ProjectState, ProjectStates } from "./ProjectState";

export default class Project implements TreeItemAdaptable {

    private static readonly CONTEXT_ID = "ext.mc.projectItem";             // must match package.json

    public readonly name: string;
    public readonly id: string;
    public readonly type: string;           // should be an enum
    public readonly language: string;
    public readonly contextRoot: string;

    private status: ProjectState = ProjectState.UNKNOWN;

    constructor (
        public readonly projectInfo: any,
        public readonly localPath: vscode.Uri
    ) {
        console.log("Project constructor");
        this.name = projectInfo.name;
        this.type = projectInfo.type;
        if (!this.type) {
            this.type = "unknown";
        }
        this.id = projectInfo.projectID;
        // TODO should use projectType but it's missing sometimes
        this.type = projectInfo.buildType;
        this.language = projectInfo.language;
        this.contextRoot = projectInfo.contextRoot;
        this.setStatus(projectInfo);

        console.log("Created project:", this);
    }

    public getChildren(): TreeItemAdaptable[] {
        // Projects have no children.
        return [];
    }

    public toTreeItem(): vscode.TreeItem {
        const ti = new vscode.TreeItem(`${this.name} (${Project.uppercase(this.language)}) - [${this.status}]`, vscode.TreeItemCollapsibleState.None);
        ti.resourceUri = this.localPath;
        ti.tooltip = ti.resourceUri.fsPath.toString();
        ti.contextValue = Project.CONTEXT_ID;
        return ti;
    }

    public setStatus = (projectInfo: any): void => {
        if (this == null) {
            console.error("Failed to bind this");
            return;
        }
        else if (projectInfo.projectID !== this.id) {
            // shouldn't happen, but just in case
            console.log(`Project ${this.id} received status update request for wrong project ${projectInfo.projectID}`);
            return;
        }

        const oldStatus = this.status;
        console.log(`${this.name} is having its status updated from ${oldStatus}`);
        this.status = ProjectStates.convert(projectInfo);

        if (this.status === oldStatus) {
            console.log("Status did not change");
        }
        else {
            console.log(`${this.name} has a new status: ${this.status}`);
        }
    }

    private static uppercase(input: string): string {
        return input.charAt(0).toUpperCase() + input.slice(1);
    }
}