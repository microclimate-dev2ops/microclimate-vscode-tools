import * as vscode from "vscode";
import { TreeItemAdaptable } from "../../view/projectExplorer/TreeItemAdaptable";
import { ProjectState, ProjectStates } from "./ProjectState";

export default class Project implements TreeItemAdaptable {

    private static readonly CONTEXT_ID = "ext.mc.projectItem";             // must match package.json

    public readonly name: string;
    public readonly id: string;
    public readonly type: string;           // should be an enum
    public readonly contextRoot: string;

    private _status: ProjectState = ProjectState.UNKNOWN;

    constructor (
        public readonly projectInfo: any,
        public readonly localPath: vscode.Uri
    ) {
        this.name = projectInfo.name;
        this.type = projectInfo.type;
        if (!this.type) {
            this.type = "unknown";
        }
        this.id = projectInfo.projectID;
        this.type = projectInfo.projectType;
        this.contextRoot = projectInfo.contextRoot;
        this.setStatus(projectInfo);

        console.log("Created project:", this);
    }

    public getChildren(): TreeItemAdaptable[] {
        // Projects have no children.
        return [];
    }

    public toTreeItem(): vscode.TreeItem {
        const ti = new vscode.TreeItem(`${this.name} [${this.type}] - [${this._status}]`, vscode.TreeItemCollapsibleState.None);
        ti.resourceUri = this.localPath;
        ti.tooltip = ti.resourceUri.fsPath.toString();
        ti.contextValue = Project.CONTEXT_ID;
        return ti;
    }

    public setStatus(projectInfo: any) {
        this._status = ProjectStates.convert(projectInfo.appStatus, projectInfo.state, projectInfo.startMode);
    }
}