import * as vscode from "vscode";
import { TreeItemAdaptable } from "../../view/projectExplorer/TreeItemAdaptable";
import { ProjectState } from "./ProjectState";
import { ProjectType } from "./ProjectType";

export default class Project implements TreeItemAdaptable {

    private static readonly CONTEXT_ID = "ext.mc.projectItem";             // must match package.json

    public readonly name: string;
    public readonly id: string;
    public readonly type: ProjectType;
    public readonly contextRoot: string;

    private status: ProjectState = ProjectState.States.UNKNOWN;

    constructor (
        public readonly projectInfo: any,
        public readonly localPath: vscode.Uri
    ) {
        this.name = projectInfo.name;
        this.id = projectInfo.projectID;

        // TODO should use projectType but it's missing sometimes
        this.type = new ProjectType(projectInfo.buildType, projectInfo.language);

        this.contextRoot = projectInfo.contextRoot;
        this.setStatus(projectInfo);

        // console.log("Created project:", this);
        console.log("Created project " + this.name);
    }

    public getChildren(): TreeItemAdaptable[] {
        // Projects have no children.
        return [];
    }

    public toTreeItem(): vscode.TreeItem {
        const ti = new vscode.TreeItem(`${this.name} (${this.type.userFriendlyType}) - [${this.status}]`, 
                vscode.TreeItemCollapsibleState.None);

        ti.resourceUri = this.localPath;
        ti.tooltip = ti.resourceUri.fsPath.toString();
        ti.contextValue = Project.CONTEXT_ID;
        return ti;
    }

    /**
     * Set this project's status based on the project info event payload passed
     * @return If a change was made, and therefore a refresh of the project tree is required
     */
    public setStatus = (projectInfo: any): Boolean => {
        if (projectInfo.projectID !== this.id) {
            // shouldn't happen, but just in case
            console.log(`Project ${this.id} received status update request for wrong project ${projectInfo.projectID}`);
            return false;
        }

        const oldStatus = this.status;
        // console.log(`${this.name} is having its status updated from ${oldStatus}`);
        this.status = ProjectState.convert(projectInfo);

        if (this.status === oldStatus) {
            // console.log("Status did not change");
            return false;
        }
        else {
            console.log(`${this.name} has a new status: ${this.status}`);
            return true;
        }
    }
}