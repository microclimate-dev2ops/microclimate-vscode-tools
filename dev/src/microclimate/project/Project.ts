import * as vscode from "vscode";

import * as MCUtil from "../../MCUtil";
import TreeItemAdaptable from "../../view/TreeItemAdaptable";
import ProjectState from "./ProjectState";
import ProjectType from "./ProjectType";
import Connection from "../connection/Connection";
import * as Resources from "../../constants/Resources";
import Log from "../../Logger";
import Commands from "../../constants/Commands";

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

    public static readonly diagnostics: vscode.DiagnosticCollection
            = vscode.languages.createDiagnosticCollection("Microclimate");

    private _containerID: string | undefined;
    private _appPort: number | undefined;
    private _debugPort: number | undefined;
    private _autoBuildEnabled: Boolean;

    // Dates below will always be set, but might be "invalid date"s
    private _lastBuild: Date;
    private _lastImgBuild: Date;

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
        Log.d("Creating project from info:", projectInfo);
        this.name = projectInfo.name;
        this.id = projectInfo.projectID;

        this._containerID = projectInfo.containerId;
        this._autoBuildEnabled = projectInfo.autoBuild;
        // lastbuild is a number
        this._lastBuild = new Date(projectInfo.lastbuild);
        // appImageLastBuild is a string
        this._lastImgBuild = new Date(Number(projectInfo.appImgLastBuild));

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

        Log.d(`Created project ${this.name}:`, this);
    }

    public getChildren(): TreeItemAdaptable[] {
        // Projects have no children.
        return [];
    }

    public toTreeItem(): vscode.TreeItem {
        const ti = new vscode.TreeItem(`${this.name} ${this.state}`, vscode.TreeItemCollapsibleState.None);

        // ti.resourceUri = this.localPath;
        ti.tooltip = this.state.toString();
        // There are different context menu actions available to enabled or disabled or debugging projects
        ti.contextValue = Project.getContextID(this.state);
        ti.iconPath = this.type.icon;
        // command run on single-click (or double click - depends on a user setting - https://github.com/Microsoft/vscode/issues/39601)
        // Focuses on this project in the explorer view. Has no effect if the project is not in the current workspace.
        ti.command = {
            command: Commands.VSC_REVEAL_EXPLORER,
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
            Log.e(`Project ${this.id} received status update request for wrong project ${projectInfo.projectID}`);
            return;
        }

        this._containerID = projectInfo.containerId;
        this._lastBuild = new Date(projectInfo.lastbuild);
        this._lastImgBuild = new Date(Number(projectInfo.appImageLastBuild));

        const oldState = this._state;
        this._state = new ProjectState(projectInfo, oldState);

        // Whether or not this update call has changed the project such that we have to update the UI.
        let changed: Boolean = false;
        if (this._state !== oldState) {
            changed = true;
            Log.d(`${this.name} went from ${oldState} to ${this._state} startMode=${projectInfo.startMode}`);
        }

        const newContainerID: string | undefined = projectInfo.containerID;
        if (newContainerID != null) {
            this._containerID = newContainerID;
            Log.i(`New containerID for ${this.name} is ${this._containerID.substring(0, 8)}`);
        }

        const ports = projectInfo.ports;
        if (ports != null && ports !== "") {
            changed = this.setAppPort(ports.exposedPort) || changed;
            changed = this.setDebugPort(ports.exposedDebugPort) || changed;
        }
        else if (this._state.isStarted) {
            Log.e("No ports were provided for an app that is supposed to be started");
        }

        // If we're waiting for a state, check if we've reached one the states, and resolve the pending state promise if so.
        if (this.pendingAppStates.includes(this._state.appState)) {
            this.clearPendingState();
        }

        // Logger.log(`${this.name} has a new status:`, this._state);
        if (changed) {
            this.connection.onChange();
        }
    }

    private clearPendingState(): void {
        Log.i("Clear pending state, pending states are: " + JSON.stringify(this.pendingAppStates));
        if (this.resolvePendingAppState != null) {
            Log.i("Resolving pending state(s)");
            this.resolvePendingAppState();
        }
        else if (this.pendingAppStates.length > 0) {
            // should never happen
            Log.e("Reached pending state(s) but no resolve function was set");
        }
        this.pendingAppStates = [];
        this.resolvePendingAppState = undefined;
    }

    public async waitForStarted(timeoutMs: number): Promise<string> {
        return this.waitForState(timeoutMs, ProjectState.AppStates.STARTED, ProjectState.AppStates.DEBUGGING);
    }

    /**
     * Return a promise that resolves when this project enters one of the given AppStates.
     * This is checked when project state changes, in update() above.
     *
     * Will also clear any previous state being waited for - so be careful calling this from test code.
     */
    public async waitForState(timeoutMs: number, state: ProjectState.AppStates, ...alternateStates: ProjectState.AppStates[]): Promise<string> {
        const states: ProjectState.AppStates[] = alternateStates.concat(state);

        this.clearPendingState();

        if (states.includes(this._state.appState)) {
            Log.i("No need to wait, already in state " + this._state.appState);
            return "Already " + this._state.appState;
        }

        this.pendingAppStates = states;

        Log.i(this.name + " is waiting for states: " + states.join(", "));
        Log.i(this.name + " is currently", this._state.appState);

        let statesAsStr: string;
        if (states.length > 1) {
            statesAsStr = states.join(" or ");
        }
        else {
            statesAsStr = states[0].toString();
        }

        const pendingStatePromise = new Promise<string>( (resolve, reject) => {
            setTimeout(
                () => reject(`${this.name} did not reach ` +
                    `${states.length > 1 ? "any of states" : "state"}:` +
                    ` "${statesAsStr}" within ${timeoutMs/1000}s`),
                timeoutMs);

            this.resolvePendingAppState = resolve;
            return;
        });

        const syncIcon: string = Resources.getOcticon(Resources.Octicons.sync, true);
        vscode.window.setStatusBarMessage(`${syncIcon} Waiting for ${this.name} to be ${statesAsStr}`, pendingStatePromise);

        return pendingStatePromise;
    }

    public async clearValidationErrors(): Promise<void> {
        // Clear all diagnostics for this project's path
        Project.diagnostics.delete(this.localPath);
    }

    public setAutoBuild(newAutoBuild: Boolean): void {
        if (newAutoBuild != null) {
            this._autoBuildEnabled = newAutoBuild;
            Log.i(`Auto build status changed for ${this.name} to ${this._autoBuildEnabled}`);
        }
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

    public get state(): ProjectState {
        return this._state;
    }

    public get appBaseUrl(): vscode.Uri | undefined {
        if (this._appPort == null) {
            // app is stopped, disabled, etc.
            return undefined;
        }

        return this.connection.mcUri.with({
            authority: `${this.connection.host}:${this._appPort}`,
            path: this.contextRoot
        });
    }

    public get debugUrl(): string | undefined {
        if (this._debugPort == null) {
            return undefined;
        }

        return this.connection.host + ":" + this._debugPort;
    }

    public get lastBuild(): Date {
        return this._lastBuild;
    }

    public get lastImgBuild(): Date {
        return this._lastImgBuild;
    }

    /**
     *
     * @return If this project's app port was changed.
     */
    private setAppPort(newAppPort: number | undefined): Boolean {
        if (newAppPort == null && this._appPort != null) {
            // Should happen when the app stops.
            Log.d("Unset app port for " + this.name);
            this._appPort = undefined;
            return true;
        }

        newAppPort = Number(newAppPort);
        if (!MCUtil.isGoodPort(newAppPort)) {
            Log.w(`Invalid app port ${newAppPort} given to project ${this.name}`);
            return false;
        }
        else if (this._appPort !== newAppPort) {
            this._appPort = newAppPort;
            Log.d(`New app port for ${this.name} is ${newAppPort}`);
            return true;
        }
        return false;
    }

    /**
     *
     * @return If this project's debug port was changed.
     */
    private setDebugPort(newDebugPort: number | undefined): Boolean {
        if (newDebugPort == null && this._debugPort == null) {
            return false;
        }

        newDebugPort = Number(newDebugPort);
        if (!MCUtil.isGoodPort(newDebugPort)) {
            Log.w(`Invalid debug port ${newDebugPort} given to project ${this.name}`);
            return false;
        }
        else if (this._debugPort !== newDebugPort) {
            this._debugPort = newDebugPort;
            Log.d(`New debug port for ${this.name} is ${newDebugPort}`);
            return true;
        }
        return false;
    }
}