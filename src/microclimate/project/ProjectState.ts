import * as vscode from "vscode";
import { TreeItemAdaptable } from "../../view/projectExplorer/TreeItemAdaptable";

export class ProjectState implements TreeItemAdaptable {

    private static readonly CONTEXT_ID = "ext.mc.projectStateItem";

    private readonly state: ProjectState.States;
    private readonly buildDetail: string;
    private readonly statusEmoji: string;

    constructor (
        projectInfoPayload: any
    ) {
        if (projectInfoPayload == null) {
            // console.error("Passed null project info to ProjectState");
            this.state = ProjectState.States.UNKNOWN;
            this.buildDetail = "";
        }
        else {
            this.state = ProjectState.convert(projectInfoPayload);
            this.buildDetail = projectInfoPayload.detailedBuildStatus;
        }

        this.statusEmoji = ProjectState.getStatusEmoji(this.state);
    }

    public get isStarted(): Boolean {
        return this.state === ProjectState.States.STARTED;
    }

    public get isBuilding(): Boolean {
        return ProjectState.BUILD_STATES.indexOf(this.state) >= 0 ;
    }

    toTreeItem(): vscode.TreeItem {
        let statusStr;
        // If this is a building state, and we have a detailed build status, display the detail too
        if (this.isBuilding && this.buildDetail.trim().length > 0) {
            statusStr = `[${this.state} - ${this.buildDetail}]`;
        }
        else {
            statusStr = `[${this.state}]`;
        }

        const label = `${this.statusEmoji}  ${statusStr}`;
        const ti = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        ti.contextValue = ProjectState.CONTEXT_ID;
        ti.tooltip = statusStr;
        return ti;
    }

    getChildren(): TreeItemAdaptable[] {
        return [];
    }
}

export namespace ProjectState {

    export enum States {
        STARTED = "Started",        // maybe should be "Running" to match web UI
        STARTING = "Starting",
        STOPPING = "Stopping",
        STOPPED = "Stopped",
        DEBUGGING = "Debugging",

        BUILDING = "Building",
        BUILD_FAILED = "Build Failed",
        BUILD_QUEUED = "Build Queued",

        DISABLED = "Disabled",
        UNKNOWN = "Unknown"
    }

    export const BUILD_STATES = [ States.BUILDING, States.BUILD_QUEUED, States.BUILD_FAILED ];

    /**
     * Convert portal's project info object into a ProjectState.
     */
    export function convert(projectInfoPayload: any): ProjectState.States {

        // console.log("PIP", projectInfoPayload);
        let appStatus: string = projectInfoPayload.appStatus || "";
        appStatus = appStatus.toLowerCase();

        const closedState: string | undefined = projectInfoPayload.state;
        const startMode:   string | undefined = projectInfoPayload.startMode;
        const buildStatus: string | undefined = projectInfoPayload.buildStatus;

        // console.log(`Convert - appStatus=${appStatus}, closedState=${closedState}, startMode=${startMode}`);

        // First, check if the project is open. If it's not, it's disabled.
        if (closedState !== "open") {
            return ProjectState.States.DISABLED;
        }
        // Now, check the build states. If it's still building, the project is 'stopped'.
        else if (buildStatus === "failed") {
            return ProjectState.States.BUILD_FAILED;
        }
        else if (buildStatus === "inProgress") {
            return ProjectState.States.BUILDING;
        }
        else if (buildStatus === "queued") {
            return ProjectState.States.BUILD_QUEUED;
        }
        // else, build succeeded
        // Now, check the app states.
        else if (appStatus === "started") {
            if (startMode === "debug") {
                return ProjectState.States.DEBUGGING;
            }
            return ProjectState.States.STARTED;
        }
        else if (appStatus === "starting") {
            return ProjectState.States.STARTING;
        }
        else if (appStatus === "stopping") {
            return ProjectState.States.STOPPING;
        }
        else if (appStatus === "stopped") {
            return ProjectState.States.STOPPED;
        }

        return ProjectState.States.UNKNOWN;
    }

    export function getStatusEmoji(state: ProjectState.States): string {
        // ⚠ ▶ ⏹ ❌ ❓ ❗ ✅ 🐞
        // tslint:disable-next-line:switch-default
        switch (state) {
            case ProjectState.States.DISABLED:
                return "🚫";
            case ProjectState.States.STARTED:
                return "🔵";
            case ProjectState.States.STOPPED:
                return "🔴";
            case ProjectState.States.STARTING:
            case ProjectState.States.STOPPING:
                return "⚪";
            case ProjectState.States.BUILDING:
            case ProjectState.States.BUILD_QUEUED:
                return "🔨";
            case ProjectState.States.BUILD_FAILED:
                return "❌";
            case ProjectState.States.DEBUGGING:
                return "🐞";
        }
        return "❓";
    }
}

