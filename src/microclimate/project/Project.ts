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
    public readonly contextRoot: string;
    public readonly localPath: vscode.Uri;
    public readonly buildLogPath: vscode.Uri | undefined;

    private _appPort: number;
    private _debugPort: number = -1;

    // QuickPickItem
    public readonly label: string;
    public readonly description?: string;
    public readonly detail?: string;

    private _state: ProjectState = new ProjectState(undefined);

    constructor (
        projectInfo: any,
        public readonly connection: Connection,
    ) {
        this.name = projectInfo.name;
        this.id = projectInfo.projectID;
        this._appPort = projectInfo.ports.exposedPort;

        // TODO should use projectType but it's missing sometimes
        this.type = new ProjectType(projectInfo.buildType, projectInfo.language);

        this.localPath = vscode.Uri.file(
            MCUtil.appendPathWithoutDupe(connection.workspacePath.fsPath, projectInfo.locOnDisk)
        );

        this.contextRoot = projectInfo.contextroot || "";

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
        ti.tooltip = this.state.toString();
        ti.contextValue = Project.CONTEXT_ID;
        ti.iconPath = this.type.icon;
        // console.log(`Created TreeItem`, ti);
        return ti;
    }

    public get appBaseUrl(): vscode.Uri {
        // TODO decide how this should behave when the app is not started
        return this.connection.mcUri.with({
            authority: `${this.connection.host}:${this._appPort}`,
            path: this.contextRoot
        });
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
            // console.log(`${this.name} has a new status:`, this._state);
            return true;
        }
    }

    public get appPort() {
        return this._appPort;
    }

    public set appPort(appPort: number) {
        if (!MCUtil.isGoodPort(appPort)) {
            console.error(`Invalid app port ${appPort} given to project ${this.id}`);
            return;
        }
        this._appPort = appPort;
        console.log(`New app port for ${this.name} is ${appPort}`);
    }

    public get debugPort() {
        return this._debugPort;
    }

    public set debugPort(debugPort: number) {
        if (!MCUtil.isGoodPort(debugPort)) {
            console.error(`Invalid debug port ${debugPort} given to project ${this.id}`);
            debugPort = -1;
            return;
        }
        this._debugPort = debugPort;
        console.log(`New debug port for ${this.name} is ${debugPort}`);
    }
}