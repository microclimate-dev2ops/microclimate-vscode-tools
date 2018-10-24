import * as vscode from "vscode";

import * as MCUtil from "../../MCUtil";
import TreeItemAdaptable from "../../view/TreeItemAdaptable";
import { ProjectState } from "./ProjectState";
import { ProjectType } from "./ProjectType";
import Connection from "../connection/Connection";
import { getOcticon, Octicons } from "../../constants/Icons";
import { Logger } from "../../Logger";

export default class Project implements TreeItemAdaptable, vscode.QuickPickItem {
    // index signature so we can use Object.keys(project) nicely
    // [key: string]: any;

    // these below must match package.json
    private static readonly CONTEXT_ID_BASE: string = "ext.mc.projectItem";
    private static readonly CONTEXT_ID_ENABLED:  string = Project.CONTEXT_ID_BASE + ".enabled";
    private static readonly CONTEXT_ID_DISABLED: string = Project.CONTEXT_ID_BASE + ".disabled";
    private static readonly CONTEXT_ID_DEBUGGABLE: string = Project.CONTEXT_ID_ENABLED + ".debugging";

    public readonly name: string;
    public readonly id: string;
    public readonly type: ProjectType;
    public readonly contextRoot: string;
    public readonly localPath: vscode.Uri;

    public readonly diagnostics: vscode.DiagnosticCollection;

    private _containerID: string | undefined;
    private _appPort: number | undefined;
    private _debugPort: number | undefined;
    private _autoBuildEnabled: Boolean;

    // QuickPickItem
    public readonly label: string;
    public readonly detail?: string;

    private _state: ProjectState = new ProjectState(undefined);

    private pendingAppStates: ProjectState.AppStates[] = [];
    private resolvePendingAppState: ( () => void ) | undefined;

    constructor (
        projectInfo: any,
        public readonly connection: Connection,
    ) {
        Logger.log("Creating project from info:", projectInfo);
        this.name = projectInfo.name;
        this.id = projectInfo.projectID;
        this._containerID = projectInfo.containerId;
        this._autoBuildEnabled = projectInfo.autoBuild;

        this.diagnostics = vscode.languages.createDiagnosticCollection(this.name);

        // TODO should use projectType not buildType but it's missing sometimes
        this.type = new ProjectType(projectInfo.buildType, projectInfo.language);

        this.localPath = vscode.Uri.file(
            MCUtil.appendPathWithoutDupe(connection.workspacePath.fsPath, projectInfo.locOnDisk)
        );

        this.contextRoot = projectInfo.contextroot || "";

        this.update(projectInfo);

        // QuickPickItem
        this.label = `${this.name} (${this.type} project)`;
        // this.detail = this.id;

        Logger.log("Created project:", this);
    }

    public getChildren(): TreeItemAdaptable[] {
        // Projects have no children.
        return [];
    }

    public toTreeItem(): vscode.TreeItem {
        const ti = new vscode.TreeItem(`${this.name} ${this.state}`, vscode.TreeItemCollapsibleState.None);

        ti.resourceUri = this.localPath;
        ti.tooltip = this.state.toString();
        // There are different context menu actions available to enabled or disabled or debugging projects
        ti.contextValue = Project.getContextID(this.state);
        ti.iconPath = this.type.icon;
        // command run on single-click (or double click - depends on a user setting - https://github.com/Microsoft/vscode/issues/39601)
        // Focuses on this project in the explorer view. Has no effect if the project is not in the current workspace.
        ti.command = {
            command: "revealInExplorer",
            title: "",
            arguments: [this.localPath]
        };
        // Logger.log(`Created TreeItem`, ti);
        return ti;
    }

    private static getContextID(state: ProjectState): string {
        if (state.isEnabled) {
            if (state.appState === ProjectState.AppStates.DEBUGGING) {
                return Project.CONTEXT_ID_DEBUGGABLE;
            }
            else {
                return Project.CONTEXT_ID_ENABLED;
            }
        }
        else {
            return Project.CONTEXT_ID_DISABLED;
        }
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
            Logger.logE(`Project ${this.id} received status update request for wrong project ${projectInfo.projectID}`);
            return;
        }

        this._containerID = projectInfo.containerId;

        const oldState = this._state;
        this._state = new ProjectState(projectInfo, oldState);

        // Whether or not this update call has changed the project such that we have to update the UI.
        let changed: Boolean = false;
        if (this._state !== oldState) {
            changed = true;
            Logger.log(`${this.name} went from ${oldState} to ${this._state} startMode=${projectInfo.startMode}`);
        }

        const newAutoBuild: Boolean | undefined = projectInfo.autoBuild;
        if (newAutoBuild != null) {
            this._autoBuildEnabled = newAutoBuild;
            Logger.log(`Auto build status changed for ${this.name} to ${this._autoBuildEnabled}`);
        }

        const ports = projectInfo.ports;
        if (ports != null && ports !== "") {
            changed = this.setAppPort(ports.exposedPort) || changed;
            changed = this.setDebugPort(ports.exposedDebugPort) || changed;
        }
        else if (this._state.isStarted) {
            Logger.logE("No ports were provided for an app that is supposed to be started");
        }

        // If we're waiting for a state, check if we've reached one the states, and resolve the pending state promise if so.
        if (this.pendingAppStates.indexOf(this._state.appState) >= 0) {
            if (this.resolvePendingAppState != null) {
                Logger.log("Reached pending state: " + this.pendingAppStates);
                this.resolvePendingAppState();
                this.pendingAppStates = [];
                this.resolvePendingAppState = undefined;
            }
            else {
                // should never happen
                Logger.logE("PendingState was set but no resolve function was");
                this.pendingAppStates = [];
            }
        }

        // Logger.log(`${this.name} has a new status:`, this._state);
        if (changed) {
            this.connection.onChange();
        }
    }

    public async waitForState(timeoutMs: number, state: ProjectState.AppStates, ...alternateStates: ProjectState.AppStates[]): Promise<string> {
        const states: ProjectState.AppStates[] = alternateStates.concat(state);
        if (states.indexOf(this._state.appState) >= 0) {
            Logger.log("No need to wait, already in state " + this._state.appState);
            return "Already " + this._state.appState;
        }

        // Clear the old pendingState
        if (this.resolvePendingAppState != null) {
            Logger.log("Cancelling waiting for state ", this.pendingAppStates);
            this.resolvePendingAppState();
        }
        this.pendingAppStates = states;

        Logger.log(this.name + " is waiting for states: " + states);

        let statesAsStr: string;
        if (states.length > 1) {
            statesAsStr = states.join(" or ");
        }
        else {
            statesAsStr = states[0].toString();
        }

        const pendingStatePromise = new Promise<string>( (resolve, reject) => {
            setTimeout(
                () => reject(`${this.name} did not reach any of states: "${statesAsStr}" within ${timeoutMs/1000}s`),
                timeoutMs);

            this.resolvePendingAppState = resolve;
            return;
        });

        vscode.window.setStatusBarMessage(`${getOcticon(Octicons.sync, true)} Waiting for ${this.name} to be ${statesAsStr}`, pendingStatePromise);

        return pendingStatePromise;
    }

    public get containerID(): string | undefined {
        return this._containerID;
    }

    public get appPort(): number | undefined {
        return this._appPort;
    }

    public get debugPort(): number | undefined {
        return this._debugPort;
    }

    public get autoBuildEnabled(): Boolean {
        return this._autoBuildEnabled;
    }

    /**
     *
     * @return If this project's app port was changed.
     */
    private setAppPort(newAppPort: number | undefined): Boolean {
        if (newAppPort == null && this._appPort != null) {
            // Should happen when the app stops.
            Logger.log("Unset app port for " + this.name);
            this._appPort = undefined;
            return true;
        }

        newAppPort = Number(newAppPort);
        if (!MCUtil.isGoodPort(newAppPort)) {
            Logger.log(`Invalid app port ${newAppPort} given to project ${this.name}`);
            return false;
        }
        else if (this._appPort !== newAppPort) {
            this._appPort = newAppPort;
            Logger.log(`New app port for ${this.name} is ${newAppPort}`);
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
            Logger.log(`Invalid debug port ${newDebugPort} given to project ${this.name}`);
            return false;
        }
        else if (this._debugPort !== newDebugPort) {
            this._debugPort = newDebugPort;
            Logger.log(`New debug port for ${this.name} is ${newDebugPort}`);
            return true;
        }
        return false;
    }
}