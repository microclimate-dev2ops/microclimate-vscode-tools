import * as vscode from "vscode";

import * as MCUtil from "../../MCUtil";
import TreeItemAdaptable from "../../view/TreeItemAdaptable";
import { ProjectState } from "./ProjectState";
import { ProjectType } from "./ProjectType";
import Connection from "../connection/Connection";
import { getOcticon, Octicons } from "../../constants/Icons";

export default class Project implements TreeItemAdaptable, vscode.QuickPickItem {
    private static readonly CONTEXT_ID: string = "ext.mc.projectItem";             // must match package.json
    private static readonly ENABLED_CONTEXT_ID:  string = Project.CONTEXT_ID + ".enabled";
    private static readonly DISABLED_CONTEXT_ID: string = Project.CONTEXT_ID + ".disabled";

    public readonly name: string;
    public readonly id: string;
    public readonly type: ProjectType;
    public readonly contextRoot: string;
    public readonly localPath: vscode.Uri;
    public readonly buildLogPath: vscode.Uri | undefined;

    private _containerID: string;
    private _appPort: number | undefined;
    private _debugPort: number | undefined;

    // QuickPickItem
    public readonly label: string;
    public readonly detail?: string;

    private _state: ProjectState = new ProjectState(undefined);

    private pendingAppState: ProjectState.AppStates | undefined;
    private resolvePendingAppState: ( () => void) | undefined;

    constructor (
        projectInfo: any,
        public readonly connection: Connection,
    ) {
        this.name = projectInfo.name;
        this.id = projectInfo.projectID;
        this._containerID = projectInfo.containerId;

        // TODO should use projectType not buildType but it's missing sometimes
        this.type = new ProjectType(projectInfo.buildType, projectInfo.language);

        this.localPath = vscode.Uri.file(
            MCUtil.appendPathWithoutDupe(connection.workspacePath.fsPath, projectInfo.locOnDisk)
        );

        this.contextRoot = projectInfo.contextroot || "";

        // TODO this should be removed and replace OpenBuildLogCmd with a GET to the build-log endpoint.
        if (projectInfo.logs && projectInfo.logs.build) {
            this.buildLogPath = vscode.Uri.file(
                MCUtil.appendPathWithoutDupe(connection.workspacePath.fsPath, projectInfo.logs.build.file)
            );
            console.log(`Build log for project ${this.name} is at ${this.buildLogPath}`);
        }
        // Node projects don't have build logs; any other type should
        else if (this.type.providesBuildLog) {
            console.error(`Couldn't get build logs for ${this.type.userFriendlyType} project ${this.name}, the logs object is:`, projectInfo.logs);
        }

        this.update(projectInfo);

        // QuickPickItem
        this.label = `${this.name} (${this.type} project)`;
        // this.detail = this.id;

        console.log("Created project:", this);
    }

    public getChildren(): TreeItemAdaptable[] {
        // Projects have no children.
        return [];
    }

    public toTreeItem(): vscode.TreeItem {
        const ti = new vscode.TreeItem(`${this.name} ${this.state}`, vscode.TreeItemCollapsibleState.None);

        ti.resourceUri = this.localPath;
        ti.tooltip = this.state.toString();
        // There are different context menu actions available to enabled or disabled projects
        ti.contextValue = this.state.isEnabled ? Project.ENABLED_CONTEXT_ID : Project.DISABLED_CONTEXT_ID;
        ti.iconPath = this.type.icon;
        // command run on single-click (or double click - depends on a user setting - https://github.com/Microsoft/vscode/issues/39601)
        // Focuses on this project in the explorer view. Has no effect if the project is not in the current workspace.
        ti.command = {
            command: "revealInExplorer",
            title: "",
            arguments: [this.localPath]
        };
        // console.log(`Created TreeItem`, ti);
        return ti;
    }

    // description used by QuickPickItem
    public get description(): string {
        const appUrl = this.appBaseUrl;
        if (appUrl != null) {
            return appUrl.toString();
        }
        else {
            return "[Not running]";
        }
    }

    public get appBaseUrl(): vscode.Uri | undefined {
        if (this._appPort != null) {
            return this.connection.mcUri.with({
                authority: `${this.connection.host}:${this._appPort}`,
                path: this.contextRoot
            });
        }
        // app is stopped, disabled, etc.
        return undefined;
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

        this._containerID = projectInfo.containerId;

        const oldState = this._state;
        this._state = new ProjectState(projectInfo, oldState);

        // Whether or not this update call has changed the project such that we have to update the UI.
        let changed: Boolean = false;
        if (this._state !== oldState) {
            changed = true;
            console.log(`${this.name} went from ${oldState} to ${this._state} startMode=${projectInfo.startMode}`);
        }

        const ports = projectInfo.ports;
        if (ports != null && ports !== "") {
            changed = this.setAppPort(ports.exposedPort) || changed;
            changed = this.setDebugPort(ports.exposedDebugPort) || changed;
        }
        else if (this._state.isStarted) {
            console.error("No ports were provided for an app that is supposed to be started");
        }

        // If we're waiting for a state, check if we've reached that state, and resolve the pending state promise if so.
        if (this.pendingAppState != null && this._state.appState === this.pendingAppState) {
            if (this.resolvePendingAppState != null) {
                console.log("Reached pending state", this.pendingAppState);
                this.resolvePendingAppState();
                this.pendingAppState = undefined;
                this.resolvePendingAppState = undefined;
            }
            else {
                // should never happen
                console.error("PendingState was set but no resolve function was");
                this.pendingAppState = undefined;
            }
        }

        // console.log(`${this.name} has a new status:`, this._state);
        if (changed) {
            this.connection.onChange();
        }
    }

    public async waitForState(state: ProjectState.AppStates, timeoutMs: number = 60000): Promise<string> {
        if (this._state.appState === state) {
            console.log("No need to wait, already in state " + state);
            return "Already " + state;
        }

        // Clear the old pendingState
        if (this.resolvePendingAppState != null) {
            console.log("Cancelling waiting for state ", this.pendingAppState);
            this.resolvePendingAppState();
        }
        this.pendingAppState = state;

        console.log(this.name + " is waiting for state",  state);

        const pendingStatePromise = new Promise<string>( (resolve, reject) => {
            setTimeout(
                () => reject(`${this.name} did not reach state "${state}" within ${timeoutMs/1000}s`),
                timeoutMs);

            this.resolvePendingAppState = resolve;
            return;
        });

        vscode.window.setStatusBarMessage(`${getOcticon(Octicons.sync, true)} Waiting for ${this.name} to be ${state}`, pendingStatePromise);

        return pendingStatePromise;
    }

    public get containerID(): string {
        return this._containerID;
    }

    public get appPort(): number | undefined {
        return this._appPort;
    }

    public get debugPort(): number | undefined {
        return this._debugPort;
    }

    /**
     *
     * @return If this project's app port was changed.
     */
    private setAppPort(newAppPort: number | undefined): Boolean {
        if (newAppPort == null && this._appPort != null) {
            // Should happen when the app stops.
            console.log("Unset app port for " + this.name);
            this._appPort = undefined;
            return true;
        }

        newAppPort = Number(newAppPort);
        if (!MCUtil.isGoodPort(newAppPort)) {
            console.log(`Invalid app port ${newAppPort} given to project ${this.name}`);
            return false;
        }
        else if (this._appPort !== newAppPort) {
            this._appPort = newAppPort;
            console.log(`New app port for ${this.name} is ${newAppPort}`);
            return true;
        }
        return false;
    }

    /**
     *
     * @return If this project's debug port was changed.
     */
    private setDebugPort(newDebugPort: number | undefined): Boolean {
        newDebugPort = Number(newDebugPort);
        if (!MCUtil.isGoodPort(newDebugPort)) {
            console.log(`Invalid debug port ${newDebugPort} given to project ${this.name}`);
            return false;
        }
        else if (this._debugPort !== newDebugPort) {
            this._debugPort = newDebugPort;
            console.log(`New debug port for ${this.name} is ${newDebugPort}`);
            return true;
        }
        return false;
    }
}