import * as vscode from "vscode";
import * as path from "path";

import * as MCUtil from "../../MCUtil";
import TreeItemAdaptable from "../../view/projectExplorer/TreeItemAdaptable";
import { ProjectState } from "./ProjectState";
import { ProjectType } from "./ProjectType";
import Connection from "../connection/Connection";

export default class Project implements TreeItemAdaptable, vscode.QuickPickItem {
    private static readonly CONTEXT_ID = "ext.mc.projectItem";             // must match package.json
    private static readonly ENABLED_CONTEXT_ID  = Project.CONTEXT_ID + ".enabled";
    private static readonly DISABLED_CONTEXT_ID = Project.CONTEXT_ID + ".disabled";

    public readonly name: string;
    public readonly id: string;
    public readonly type: ProjectType;
    public readonly contextRoot: string;
    public readonly localPath: vscode.Uri;
    public readonly buildLogPath: vscode.Uri | undefined;

    private _appPort: number | undefined;
    private _debugPort: number | undefined;

    // QuickPickItem
    public readonly label: string;
    public readonly detail?: string;

    private _state: ProjectState = new ProjectState(undefined);

    private pendingState: ProjectState.AppStates | undefined;
    private resolvePendingState: Function | undefined;

    constructor (
        projectInfo: any,
        public readonly connection: Connection,
    ) {
        this.name = projectInfo.name;
        this.id = projectInfo.projectID;

        // TODO should use projectType not buildType but it's missing sometimes
        this.type = new ProjectType(projectInfo.buildType, projectInfo.language);

        this.localPath = vscode.Uri.file(
            MCUtil.appendPathWithoutDupe(connection.workspacePath.fsPath, projectInfo.locOnDisk)
        );

        this.contextRoot = projectInfo.contextroot || "";

        if (projectInfo.logs && projectInfo.logs.build) {
            this.buildLogPath = vscode.Uri.file(
                MCUtil.appendPathWithoutDupe(connection.workspacePath.fsPath, projectInfo.logs.build.file)
            );
            console.log(`Build log for project ${this.name} is at ${this.buildLogPath}`);
        }
        // Node projects don't have build logs; any other type should
        else if (this.type.type !== ProjectType.Types.NODE) {
            console.error(`Couldn't get build logs for project ${this.name}, the logs object is:`, projectInfo.logs);
        }

        this.update(projectInfo);

        // QuickPickItem
        this.label = `${this.name} (${this.type} project)`;
        // this.detail = this.id;

        console.log("Created project:", this);
    }

    public getChildren(): TreeItemAdaptable[] {
        return [];
    }

    public toTreeItem(): vscode.TreeItem {
        const ti = new vscode.TreeItem(`${this.name} ${this.state}`, vscode.TreeItemCollapsibleState.None);

        ti.resourceUri = this.localPath;
        ti.tooltip = this.state.toString();
        // There are different context menu actions available to enabled or disabled projects
        // If you want to target both, use "viewItem ~= /^Project.CONTEXT_ID*$/"
        ti.contextValue = this.state.isEnabled ? Project.ENABLED_CONTEXT_ID : Project.DISABLED_CONTEXT_ID;
        ti.iconPath = this.type.icon;
        // console.log(`Created TreeItem`, ti);
        return ti;
    }

    // description used by QuickPickItem
    public get description(): string {
        return this.appBaseUrl.toString();
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
     * Set this project's status based on the project info event payload passed.
     * This includes checking the appStatus, buildStatus, buildStatusDetail, and startMode.
     * Also updates the appPort and debugPort.
     *
     * Also signals the ConnectionManager change listener
     */
    public update = (projectInfo: any): void => {
        if (projectInfo.projectID !== this.id) {
            // shouldn't happen, but just in case
            console.error(`Project ${this.id} received status update request for wrong project ${projectInfo.projectID}`);
            return;
        }

        const oldState = this._state;
        // console.log(`${this.name} is having its status updated from ${oldStatus}`);
        this._state = new ProjectState(projectInfo, oldState);

        if (this._state === oldState) {
            // console.log("Status did not change");
            return;
        }

        const ports = projectInfo.ports;
        if (ports != null && ports !== "") {
            this.setAppPort(ports.exposedPort);
            this.setDebugPort(ports.exposedDebugPort);
        }
        else if (this._state.isStarted) {
            console.error("No ports were provided for an app that is supposed to be started");
        }

        // If we're waiting for a state, check if we've reached that state, and resolve the pending state promise if so.
        if (this.pendingState != null && this._state.appState === this.pendingState) {
            if (this.resolvePendingState != null) {
                console.log("Reached pending state", this.pendingState);
                this.resolvePendingState();
                this.pendingState = undefined;
                this.resolvePendingState = undefined;
            }
            else {
                console.error("PendingState was set but no resolve function was");
                this.pendingState = undefined;
            }
        }

        // console.log(`${this.name} has a new status:`, this._state);
        this.connection.onChange();
    }

    public async waitForState(state: ProjectState.AppStates, timeoutMs: number = 60000): Promise<string> {
        if (this._state.appState === state) {
            console.log("No need to wait, already in state " + state);
            return "Already " + state;
        }

        this.pendingState = state;
        console.log(this.name + " is waiting for state",  state);

        const pendingStatePromise = new Promise<string>( (resolve, reject) => {
            // TODO try shortening this timeout and see if the error handling works.
            setTimeout(
                () => reject(`${this.name} did not reach ${state} state within ${timeoutMs/1000}s`),
                timeoutMs);

            this.resolvePendingState = resolve;
            return;
        });

        vscode.window.setStatusBarMessage(`${MCUtil.getOcticon("sync", true)} Waiting for ${this.name} to be ${state}`, pendingStatePromise);

        return pendingStatePromise;
    }

    public get appPort(): number | undefined {
        return this._appPort;
    }

    public get debugPort(): number | undefined {
        return this._debugPort;
    }

    private setAppPort(newAppPort: number): void {
        newAppPort = Number(newAppPort);
        if (!MCUtil.isGoodPort(newAppPort)) {
            console.log(`Invalid app port ${newAppPort} given to project ${this.name}`);
            return;
        }
        else if (this._appPort !== newAppPort) {
            this._appPort = newAppPort;
            console.log(`New app port for ${this.name} is ${newAppPort}`);
        }
    }

    private setDebugPort(newDebugPort: number): void {
        newDebugPort = Number(newDebugPort);
        if (!MCUtil.isGoodPort(newDebugPort)) {
            console.log(`Invalid debug port ${newDebugPort} given to project ${this.name}`);
            return;
        }
        else if (this._debugPort !== newDebugPort) {
            this._debugPort = newDebugPort;
            console.log(`New debug port for ${this.name} is ${newDebugPort}`);
        }
    }
}