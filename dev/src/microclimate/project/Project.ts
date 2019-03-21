/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import MCUtil from "../../MCUtil";
import ITreeItemAdaptable from "../../view/TreeItemAdaptable";
import ProjectState from "./ProjectState";
import ProjectType from "./ProjectType";
import { Connection } from "../connection/ConnectionExporter";
import Log from "../../Logger";
import Commands from "../../constants/Commands";
import DebugUtils from "./DebugUtils";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import { refreshProjectOverview } from "./ProjectOverview";
import getContextID from "./ProjectContextID";
import ProjectPendingRestart from "./ProjectPendingRestart";
import StartModes from "../../constants/StartModes";
import SocketEvents from "../connection/SocketEvents";

const STRING_NS = StringNamespaces.PROJECT;

export default class Project implements ITreeItemAdaptable, vscode.QuickPickItem {

    // Immutable project data
    public readonly name: string;
    public readonly id: string;
    public readonly type: ProjectType;
    public readonly contextRoot: string;
    public readonly localPath: vscode.Uri;

    // Mutable project data, will change with calls to update(). Prefixed with _ because these all have getters.
    private _state: ProjectState;
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

    // in MS
    private readonly RESTART_TIMEOUT: number = 180 * 1000;
    // Represents a pending restart operation. Only set if the project is currently restarting.
    private pendingRestart: ProjectPendingRestart | undefined;

    // Active ProjectInfo webviewPanel. Only one per project. Undefined if no project overview page is active.
    // Track this so we can refresh it when update() is called, and prevent multiple webviews being open for one project.
    private activeProjectInfo: vscode.WebviewPanel | undefined;

    constructor(
        projectInfo: any,
        public readonly connection: Connection,
    ) {
        Log.d("Creating project from info:", projectInfo);
        this.name = projectInfo.name;
        this.id = projectInfo.projectID;

        // should use projectType not buildType but it's missing sometimes
        // https://github.ibm.com/dev-ex/portal/issues/520
        this.type = new ProjectType(projectInfo.buildType, projectInfo.language);

        this.localPath = vscode.Uri.file(
            MCUtil.appendPathWithoutDupe(connection.workspacePath.fsPath, vscode.Uri.file(projectInfo.locOnDisk).fsPath)
        );

        this.contextRoot = projectInfo.contextroot || "";

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

        Log.i(`Created project ${this.name}:`, this);
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

    public onConnectionDisconnect(): void {
        if (this.pendingRestart != null) {
            this.pendingRestart.onConnectionDisconnect();
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
            // Ignore these if it's a restart because the restart event won't have them
            changed = this.setContainerID(projectInfo.containerId) || changed;
            changed = this.setLastBuild(projectInfo.lastbuild) || changed;
            // appImageLastBuild is a string
            changed = this.setLastImgBuild(Number(projectInfo.appImageLastBuild)) || changed;
            changed = this.setAutoBuild(projectInfo.autoBuild) || changed;
        }

        // note oldState can be null if this is the first time update is being invoked.
        const oldState = this._state;
        this._state = new ProjectState(projectInfo, oldState != null ? oldState : undefined);

        if (!this._state.equals(oldState)) {
            changed = true;
            const startModeMsg = projectInfo.startMode == null ? "" : `, startMode=${projectInfo.startMode}`;
            Log.d(`${this.name} went from ${oldState} to ${this._state}${startModeMsg}`);
        }

        const ports = projectInfo.ports;
        if (ports != null) {
            changed = this.setAppPort(ports.exposedPort) || changed;
            changed = this.setDebugPort(ports.exposedDebugPort) || changed;
        }
        else if (this._state.isStarted) {
            Log.e("No ports were provided for an app that is supposed to be started");
        }

        if (this.pendingRestart != null) {
            this.pendingRestart.onStateChange(this.state.appState);
        }

        // Logger.log(`${this.name} has a new status:`, this._state);
        if (changed) {
            // Log.d(`${this.name} has changed`);
            this.connection.onChange();
            this.tryRefreshProjectInfoPage();
        }

        return this._state;
    }

    public get isRestarting(): boolean {
        return this.pendingRestart != null;
    }

    public doRestart(mode: StartModes.Modes): boolean {
        if (this.pendingRestart != null) {
            // should be prevented by the RestartProjectCommand
            Log.e(this.name + ": doRestart called when already restarting");
            return false;
        }

        this.pendingRestart = new ProjectPendingRestart(this, mode, this.RESTART_TIMEOUT);
        return true;
    }

    public onRestartFinish(): void {
        Log.d(this.name + ": onRestartFinish");
        this.pendingRestart = undefined;
    }

    /**
     * Validate the restart event. If it succeeded, update ports.
     * Notifies the pendingRestart.
     */
    public onRestartEvent(event: SocketEvents.IProjectRestartedEvent): void {
        let success: boolean;
        let errMsg: string | undefined;

        if (this.pendingRestart == null) {
            Log.e(this.name + ": received restart event without a pending restart", event);
            return;
        }

        if (SocketEvents.STATUS_SUCCESS !== event.status) {
            Log.e(`${this.name}: Restart failed, response is`, event);

            errMsg = Translator.t(StringNamespaces.DEFAULT, "genericErrorProjectRestart", { thisName: this.name });
            if (event.errorMsg != null) {
                errMsg = event.errorMsg;
            }

            success = false;
        }
        else if (event.ports == null || event.startMode == null || !StartModes.allStartModes().includes(event.startMode)) {
            // If the status is "success" (as we just checked), these must all be set and valid
            errMsg = Translator.t(StringNamespaces.DEFAULT, "genericErrorProjectRestart", { thisName: this.name });
            Log.e(errMsg + ", payload:", event);

            success = false;
        }
        else {
            Log.d("Restart event is valid");

            this.setAppPort(event.ports.exposedPort);
            this.setDebugPort(event.ports.exposedDebugPort);
            this.tryRefreshProjectInfoPage();

            success = true;
        }

        this.pendingRestart.onReceiveRestartEvent(success, errMsg);
    }

    /**
     * Callback for when this project is deleted in Microclimate
     */
    public async onDelete(): Promise<void> {
        Log.d("Deleting project " + this.name);
        vscode.window.showInformationMessage(Translator.t(STRING_NS, "onDeletion", { projectName: this.name }));
        this.clearValidationErrors();
        this.connection.logManager.destroyLogsForProject(this.id);
        DebugUtils.removeDebugLaunchConfigFor(this);

        if (this.activeProjectInfo != null) {
            this.activeProjectInfo.dispose();
        }
    }

    /**
     * Clear all diagnostics for this project's path
     */
    public async clearValidationErrors(): Promise<void> {
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

    private tryRefreshProjectInfoPage(): void {
        if (this.activeProjectInfo != null) {
            // Log.d("Refreshing projectinfo");
            refreshProjectOverview(this.activeProjectInfo, this);
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

        // TODO Microclimate on ICP will use HTTPS but the apps will (probably, or always?) use http
        return this.connection.mcUrl.with({
            scheme: "http",
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

    public get hasContextRoot(): boolean {
        return this.contextRoot != null && this.contextRoot.length > 0 && this.contextRoot !== "/";
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
            if (asStr.length === 0) {
                Log.w(`Empty containerID for ${this.name}`);
            }
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
