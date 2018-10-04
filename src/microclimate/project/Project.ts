import * as vscode from "vscode";

import * as MCUtil from "../../MCUtil";
import TreeItemAdaptable from "../../view/projectExplorer/TreeItemAdaptable";
import { ProjectState } from "./ProjectState";
import { ProjectType } from "./ProjectType";
import Connection from "../connection/Connection";

export default class Project implements TreeItemAdaptable, vscode.QuickPickItem {
    private static readonly CONTEXT_ID = "ext.mc.projectItem";             // must match package.json

    public readonly name: string;
    public readonly id: string;
    public readonly type: ProjectType;
    // public readonly contextRoot: string;
    public readonly localPath: vscode.Uri;
    public readonly appBaseUrl: vscode.Uri;
    public readonly buildLogPath: vscode.Uri | undefined;

    // QuickPickItem
    public readonly label: string;
    public readonly description?: string;
    public readonly detail?: string;

    private appPort: number;
    private debugPort: number = -1;

    private _state: ProjectState = new ProjectState(undefined);

    constructor (
        projectInfo: any,
        public readonly connection: Connection,
    ) {
        this.name = projectInfo.name;
        this.id = projectInfo.projectID;
        this.appPort = projectInfo.ports.exposedPort;

        // TODO should use projectType but it's missing sometimes
        this.type = new ProjectType(projectInfo.buildType, projectInfo.language);

        this.localPath = vscode.Uri.file(
            MCUtil.appendPathWithoutDupe(connection.workspacePath.fsPath, projectInfo.locOnDisk)
        );

        const contextRoot = projectInfo.contextroot || "";
        // The appBaseUrl is the MicroclimateConnection hostname plus our app port,
        // plus the context root (which may be the empty string)
        // This might have to be changed if the mcUri has anything in the path element,
        // but I don't think that will happen
        this.appBaseUrl = connection.mcUri.with({
            authority: `${connection.host}:${this.appPort}`,
            path: contextRoot
        });

        if (projectInfo.logs && projectInfo.logs.build) {
            this.buildLogPath = vscode.Uri.file(
                MCUtil.appendPathWithoutDupe(connection.workspacePath.fsPath, projectInfo.logs.build.file)
            );
        }
        else {
            console.error(`Couldn't get build logs for project ${this.name}, the logs object is: ${projectInfo.logs}`);
        }

        this.setStatus(projectInfo);

        // QuickPickItem
        this.label = `${this.name} (${this.type} project)`;
        this.description = this.appBaseUrl.toString();
        // this.detail = this.id;

        console.log("Created project:", this);
        // console.log("Created project " + this.name);
    }

    public getChildren(): TreeItemAdaptable[] {
        return [];
    }

    public toTreeItem(): vscode.TreeItem {
        const ti = new vscode.TreeItem(`${this.name} ${this.state}`, vscode.TreeItemCollapsibleState.None);

        ti.resourceUri = this.localPath;
        ti.tooltip = ti.resourceUri.fsPath.toString();
        ti.contextValue = Project.CONTEXT_ID;
        ti.iconPath = this.type.icon;
        // console.log(`Created TreeItem`, ti);
        return ti;
    }

    public get state(): ProjectState {
        return this._state;
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

        const oldState = this._state;
        // console.log(`${this.name} is having its status updated from ${oldStatus}`);
        this._state = new ProjectState(projectInfo);

        if (this._state === oldState) {
            // console.log("Status did not change");
            return false;
        }
        else {
            console.log(`${this.name} has a new status:`, this._state);
            return true;
        }
    }
}