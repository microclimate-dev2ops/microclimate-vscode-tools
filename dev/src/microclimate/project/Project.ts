import * as vscode from "vscode";

import * as MCUtil from "../../MCUtil";
import ITreeItemAdaptable from "../../view/TreeItemAdaptable";
import ProjectState from "./ProjectState";
import ProjectType from "./ProjectType";
import Connection from "../connection/Connection";
import * as Resources from "../../constants/Resources";
import Log from "../../Logger";
import Commands from "../../constants/Commands";
import DebugUtils from "./DebugUtils";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import ProjectPendingState from "./ProjectPendingState";
import { refreshProjectInfo } from "./ProjectInfo";
import getContextID from "./ProjectContextID";

const STRING_NS = StringNamespaces.PROJECT;

export default class Project implements ITreeItemAdaptable, vscode.QuickPickItem {

    // Immutable project data
    public readonly name: string;
    public readonly id: string;
    public readonly type: ProjectType;
    public readonly contextRoot: string;
    public readonly localPath: vscode.Uri;

    // Mutable project data, will change with calls to update()
    private _containerID: string | undefined;
    private _appPort: number | undefined;
    private _debugPort: number | undefined;
    private _autoBuildEnabled: boolean;
    // Dates below will always be set, but might be "invalid date"s
    private _lastBuild: Date;
    private _lastImgBuild: Date;

    public static readonly diagnostics: vscode.DiagnosticCollection
        = vscode.languages.createDiagnosticCollection("Microclimate");

    // QuickPickItem fields
    public readonly label: string;
    public readonly detail?: string;

    // Represents current app state and build state
    private _state: ProjectState;

    private pendingAppState: ProjectPendingState | undefined;

    // Active ProjectInfo webviewPanel. Only one per project.
    // Track this so we can refresh it when update() is called, and prevent multiple webviews being open for one project.
    private activeProjectInfo: vscode.WebviewPanel | undefined;

    constructor(
        projectInfo: any,
        public readonly connection: Connection,
    ) {
        Log.d("Creating project from info:", projectInfo);
        this.name = projectInfo.name;
        this.id = projectInfo.projectID;

        // TODO should use projectType not buildType but it's missing sometimes
        this.type = new ProjectType(projectInfo.buildType, projectInfo.language);

        this.localPath = vscode.Uri.file(
            MCUtil.appendPathWithoutDupe(connection.workspacePath.fsPath, projectInfo.locOnDisk)
        );

        this.contextRoot = projectInfo.contextroot || "";       // non-nls

        // These will be overridden by the call to update(), but we set them here too so the compiler can see they're always set.
        this._autoBuildEnabled = projectInfo.autoBuild;
        // lastbuild is a number
        this._lastBuild = new Date(projectInfo.lastbuild);
        // appImageLastBuild is a string
        this._lastImgBuild = new Date(Number(projectInfo.appImgLastBuild));

        this._state = this.update(projectInfo);

        // QuickPickItem
        this.label = Translator.t(STRING_NS, "quickPickLabel", { projectName: this.name, projectType: this.type.type });
        // this.detail = this.id;

        Log.d(`Created project ${this.name}:`, this);
    }

    public getChildren(): ITreeItemAdaptable[] {
        // Projects have no children.
        return [];
    }

    public toTreeItem(): vscode.TreeItem {
        const ti = new vscode.TreeItem(
            Translator.t(StringNamespaces.TREEVIEW, "projectLabel", { projectName: this.name, state: this.state.toString() }),
            vscode.TreeItemCollapsibleState.None
        );

        // ti.resourceUri = this.localPath;
        ti.tooltip = this.state.toString();
        // There are different context menu actions available to enabled or disabled or debugging projects
        ti.contextValue = getContextID(this);
        ti.iconPath = this.type.icon;
        // command run on single-click (or double click - depends on a user setting - https://github.com/Microsoft/vscode/issues/39601)
        // Focuses on this project in the middle of the explorer view. Has no effect if the project is not in the current workspace.
        ti.command = {
            command: Commands.VSC_REVEAL_EXPLORER,
            title: "",      // non-nls
            arguments: [this.localPath]
        };
        return ti;
    }

    // description used by QuickPickItem
    public get description(): string {
        const appUrl = this.appBaseUrl;
        if (appUrl != null) {
            return appUrl.toString();
        }
        else {
            return Translator.t(STRING_NS, "quickPickNotRunning");
        }
    }

    /**
     * Set this project's status based on the project info event payload passed.
     * This includes checking the appStatus, buildStatus, buildStatusDetail, and startMode.
     * Also updates the appPort and debugPort.
     *
     * Also signals the ConnectionManager change listener
     */
    public update = (projectInfo: any, isRestart: boolean = false): ProjectState => {
        if (projectInfo.projectID !== this.id) {
            // shouldn't happen, but just in case
            Log.e(`Project ${this.id} received status update request for wrong project ${projectInfo.projectID}`);
            // return the old state
            return this._state;
        }

        // Whether or not this update call has changed the project such that we have to update the UI.
        let changed: boolean = false;

        if (!isRestart) {
            // These will all be undefined since the restart event won't have them
            changed = this.setContainerID(projectInfo.containerId) || changed;
            changed = this.setLastBuild(projectInfo.lastbuild) || changed;
            // appImageLastBuild is a string
            changed = this.setLastImgBuild(Number(projectInfo.appImageLastBuild)) || changed;
            changed = this.setAutoBuild(projectInfo.autoBuild) || changed;
        }

        // note oldState can be null if this is the first time update is being invoked.
        const oldState = this._state;
        this._state = new ProjectState(projectInfo, oldState != null ? oldState : undefined);

        if (this._state !== oldState) {
            changed = true;
            Log.d(`${this.name} went from ${oldState} to ${this._state}, new startMode=${projectInfo.startMode}`);
        }

        const ports = projectInfo.ports;
        if (ports != null) {
            changed = this.setAppPort(ports.exposedPort) || changed;
            changed = this.setDebugPort(ports.exposedDebugPort) || changed;
        }
        else if (this._state.isStarted) {
            Log.e("No ports were provided for an app that is supposed to be started");
        }

        // If we're waiting for a state, check if we've reached one the states, and resolve the pending state promise if so.
        if (this.pendingAppState != null && this.pendingAppState.shouldResolve(this.state)) {
            this.fullfillPendingState(true);
        }

        // Logger.log(`${this.name} has a new status:`, this._state);
        if (changed) {
            Log.d(`${this.name} has changed`);
            this.connection.onChange();
            this.tryRefreshProjectInfoPage();
        }

        return this._state;
    }

    private tryRefreshProjectInfoPage(): void {
        if (this.activeProjectInfo != null) {
            Log.d("Refreshing projectinfo");
            refreshProjectInfo(this.activeProjectInfo, this);
        }
    }

    /**
     * Return a promise that resolves to the current appState when this project enters one of the given AppStates,
     * or rejects if waitForState is called again before the previous state is reached.
     * The state is checked when it changes in update() above.
     *
     * **DO NOT** call this from test code, since it will also clear any previous state being waited for,
     * changing how the product code executes.
     */
    public async waitForState(timeoutMs: number, ...states: ProjectState.AppStates[]): Promise<ProjectState.AppStates> {
        Log.i(`${this.name} is waiting up to ${timeoutMs}ms for states: ${states.join(", ")}`);

        if (states.length === 0) {
            // Should never happen
            Log.e("Empty states array passed to waitForState");
            return this._state.appState;
        }

        // If project is given a new state to wait for before we resolved the previous state, reject the old state.
        this.fullfillPendingState(false);

        if (states.includes(this._state.appState)) {
            Log.i("No need to wait, already in state " + this._state.appState);
            return this._state.appState;
        }

        Log.i(this.name + " is currently", this._state.appState);

        const pendingStatePromise = new Promise<ProjectState.AppStates>( (resolve, reject) => {
            const timeout = setTimeout(
                () => {
                    this.fullfillPendingState(false, timeoutMs);
                },
                timeoutMs);

            this.pendingAppState = new ProjectPendingState(this, states, resolve, reject, timeout);
        });

        // Set a status bar msg to tell the user a project is waiting for a state
        const syncIcon: string = Resources.getOcticon(Resources.Octicons.sync, true);

        // pendingAppState will never be null here because we just set it above.
        const statesStr = this.pendingAppState != null ? this.pendingAppState.pendingStatesAsStr() : "";
        const waitingMsg = Translator.t(STRING_NS, "waitingForState",
                { projectName: this.name, pendingStates: statesStr }
        );
        vscode.window.setStatusBarMessage(`${syncIcon} ${waitingMsg}`, pendingStatePromise);    // non-nls

        return pendingStatePromise;
    }

    /**
     * If there is a pending state, resolve or reject it depending on the value of `resolve`.
     * If there is no pending state, do nothing.
     */
    private fullfillPendingState(resolve: boolean, timeoutMs?: number): void {
        if (this.pendingAppState != null) {
            Log.d(`${this.name} fulfillPendingState: ${resolve ? "resolving" : "rejecting"}`);
            if (resolve) {
                this.pendingAppState.resolve();
            }
            else {
                this.pendingAppState.reject(timeoutMs);
            }
            this.pendingAppState = undefined;
        }
        else {
            Log.d("No pending state to resolve/reject");
        }
    }

    /**
     * Callback for when this project is deleted in Microclimate
     */
    public async onDelete(): Promise<void> {
        vscode.window.showInformationMessage(Translator.t(STRING_NS, "onDeletion", { projectName: this.name }));
        this.fullfillPendingState(true);
        this.clearValidationErrors();
        this.connection.logManager.destroyLogsForProject(this.id);
        DebugUtils.removeDebugLaunchConfigFor(this);
    }

    public async clearValidationErrors(): Promise<void> {
        // Clear all diagnostics for this project's path
        Project.diagnostics.delete(this.localPath);
    }

    /**
     * To be called when the user tries to open this project's Project Info page.
     *
     * If the user already has a Project Info page open for this project, returns the existing page.
     * In this case, the webview should be re-revealed, but a new one should not be created.
     * If the user does not already have an info page open for this project, returns undefined,
     * and sets the given webview to be this project's project info panel.
     */
    public onOpenProjectInfo(wvPanel: vscode.WebviewPanel): vscode.WebviewPanel | undefined {
        if (this.activeProjectInfo != null) {
            return this.activeProjectInfo;
        }
        Log.d(`Info opened for project ${this.name}`);
        this.activeProjectInfo = wvPanel;
        return undefined;
    }

    public onCloseProjectInfo(): void {
        Log.d(`Dispose project info for project ${this.name}`);
        if (this.activeProjectInfo != null) {
            this.activeProjectInfo = undefined;
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

    public get autoBuildEnabled(): boolean {
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
            authority: `${this.connection.host}:${this._appPort}`,      // non-nls
            path: this.contextRoot
        });
    }

    public get debugUrl(): string | undefined {
        if (this._debugPort == null) {
            return undefined;
        }

        return this.connection.host + ":" + this._debugPort;            // non-nls
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
    private setAppPort(newAppPort: number | undefined): boolean {
        newAppPort = Number(newAppPort);

        if (isNaN(newAppPort)) {
            // Should happen when the app stops.
            if (this._appPort != null) {
                Log.d("Unset app port for " + this.name);
                this._appPort = undefined;
                return true;
            }
        }
        else if (!MCUtil.isGoodPort(newAppPort)) {
            Log.w(`Invalid app port ${newAppPort} given to project ${this.name}, ignoring it`);
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
    private setDebugPort(newDebugPort: number | undefined): boolean {
        newDebugPort = Number(newDebugPort);

        if (isNaN(newDebugPort)) {
            // Should happen when the app stops or exits debug mode
            if (this._debugPort != null) {
                Log.d("Unset debug port for " + this.name);
                this._debugPort = undefined;
                return true;
            }
        }
        else if (!MCUtil.isGoodPort(newDebugPort)) {
            Log.w(`Invalid debug port ${newDebugPort} given to project ${this.name}, ignoring it`);
            return false;
        }
        else if (this._debugPort !== newDebugPort) {
            this._debugPort = newDebugPort;
            Log.d(`New debug port for ${this.name} is ${newDebugPort}`);
            return true;
        }
        return false;
    }

    private setContainerID(newContainerID: string | undefined): boolean {
        const oldContainerID = this._containerID;
        this._containerID = newContainerID;

        const changed = this._containerID !== oldContainerID;
        if (changed) {
            const asStr: string = this._containerID == null ? "undefined" : this._containerID.substring(0, 8);
            Log.d(`New containerID for ${this.name} is ${asStr}`);
        }
        return changed;
    }

    private setLastBuild(newLastBuild: number | undefined): boolean {
        if (newLastBuild == null) {
            return false;
        }
        const oldlastBuild = this._lastBuild;
        this._lastBuild = new Date(newLastBuild);

        const changed = this._lastBuild !== oldlastBuild;
        if (changed) {
            // Log.d(`New lastBuild for ${this.name} is ${this._lastBuild}`);
        }
        return changed;
    }

    private setLastImgBuild(newLastImgBuild: number | undefined): boolean {
        if (newLastImgBuild == null) {
            return false;
        }
        const oldlastImgBuild = this._lastImgBuild;
        this._lastImgBuild = new Date(newLastImgBuild);

        const changed = this._lastImgBuild !== oldlastImgBuild;
        if (changed) {
            // Log.d(`New lastImgBuild for ${this.name} is ${this._lastImgBuild}`);
        }
        return changed;
    }

    public setAutoBuild(newAutoBuild: boolean | undefined): boolean {
        if (newAutoBuild == null) {
            return false;
        }
        const oldAutoBuild = this._autoBuildEnabled;
        this._autoBuildEnabled = newAutoBuild;

        const changed = this._autoBuildEnabled !== oldAutoBuild;
        if (changed) {
            this.tryRefreshProjectInfoPage();
            Log.d(`New autoBuild for ${this.name} is ${this._autoBuildEnabled}`);
            // since setAutoBuild can be called outside of update(), we have to trigger the tree update here too
            this.connection.onChange();
        }

        return changed;
    }
}
