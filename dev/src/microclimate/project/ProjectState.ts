import { getStartMode } from "../../MCUtil";

export class ProjectState {
    public readonly appState: ProjectState.AppStates;
    private readonly buildState: ProjectState.BuildStates;
    private readonly buildDetail: string;

    constructor (
        projectInfoPayload: any,
        // Use below if the projectInfoPayload may be missing information (eg. from a restart success event)
        // They will be used as fallback values if the new state is null or UNKNOWN.
        fallbackState?: ProjectState
    ) {
        if (projectInfoPayload == null) {
            // console.error("Passed null project info to ProjectState");
            this.appState = ProjectState.AppStates.UNKNOWN;
            this.buildState = ProjectState.BuildStates.UNKNOWN;
            this.buildDetail = "";
        }
        else {
            let newAppState = ProjectState.getAppState(projectInfoPayload);
            let newBuildState = ProjectState.getBuildState(projectInfoPayload);
            let newBuildDetail: string = projectInfoPayload.detailedBuildStatus || "";

            // use fall-backs if they were provided, and we couldn't determine something
            if (fallbackState != null) {
                if (newAppState == null || newAppState === ProjectState.AppStates.UNKNOWN) {
                    newAppState = fallbackState.appState;
                }
                if (newBuildState == null || newBuildState === ProjectState.BuildStates.UNKNOWN) {
                    newBuildState = fallbackState.buildState;
                }
                if (newBuildDetail == null || newBuildDetail === "") {
                    newBuildDetail = fallbackState.buildDetail || "";
                }
            }
            this.appState = newAppState;
            this.buildState = newBuildState;
            this.buildDetail = newBuildDetail;
        }
    }

    public get isEnabled(): Boolean {
        return this.appState !== ProjectState.AppStates.DISABLED;
    }

    public get isStarted(): Boolean {
        return this.appState === ProjectState.AppStates.STARTED || this.appState === ProjectState.AppStates.DEBUGGING;
    }

    public get isBuilding(): Boolean {
        return this.buildState === ProjectState.BuildStates.BUILDING;
    }

    public toString(): string {
        const appState = this.appState.toString();

        let buildStateStr = "";
        if (this.isEnabled) {
            if (this.buildDetail != null && this.buildDetail.trim() !== "") {
                // a detailed status is available
                buildStateStr = ` [${this.buildState} - ${this.buildDetail}]`;
            }
            // Don't display the build state if it's unknown (or could add a case above for disabled projs)
            else if (this.buildState !== ProjectState.BuildStates.UNKNOWN) {
                buildStateStr = ` [${this.buildState}]`;
            }
        }

        return `[${appState}]${buildStateStr}`;
    }
}

export namespace ProjectState {

    export enum AppStates {
        STARTED = "Started",        // maybe should be "Running" to match web UI
        STARTING = "Starting",
        STOPPING = "Stopping",
        STOPPED = "Stopped",

        // Starting/Debug should be different from regular Starting.
        DEBUGGING = "Debugging",

        DISABLED = "Disabled",
        UNKNOWN = "Unknown"
    }

    export enum BuildStates {
        BUILD_SUCCESS = "Build Succeeded",
        BUILDING = "Building",
        BUILD_FAILED = "Build Failed",
        BUILD_QUEUED = "Build Queued",

        UNKNOWN = "Unknown"
    }

    export function getEnabledStates(): AppStates[] {
        // All states except Disabled.
        return [
            AppStates.STARTED,
            AppStates.STARTING,
            AppStates.STOPPING,
            AppStates.STOPPED,
            AppStates.DEBUGGING,
            AppStates.UNKNOWN
        ];
    }

    /**
     * Convert portal's project info object into a ProjectState.
     */
    export function getAppState(projectInfoPayload: any): ProjectState.AppStates {

        // console.log("PIP", projectInfoPayload);
        let appStatus: string = projectInfoPayload.appStatus || "";
        appStatus = appStatus.toLowerCase();

        const closedState: string | undefined = projectInfoPayload.state;
        const startMode:   string | undefined = projectInfoPayload.startMode;

        // console.log(`Convert - appStatus=${appStatus}, closedState=${closedState}, startMode=${startMode}`);

        // First, check if the project is open. If it's not, it's disabled.
        if (closedState === "closed") {
            return ProjectState.AppStates.DISABLED;
        }
        // Now, check the app states.
        else if (appStatus === "started") {
            if (startMode === getStartMode(true)) {
                return ProjectState.AppStates.DEBUGGING;
            }
            return ProjectState.AppStates.STARTED;
        }
        else if (appStatus === "starting") {
            return ProjectState.AppStates.STARTING;
        }
        else if (appStatus === "stopping") {
            return ProjectState.AppStates.STOPPING;
        }
        else if (appStatus === "stopped") {
            return ProjectState.AppStates.STOPPED;
        }
        console.error("Unknown app state:", appStatus);
        return ProjectState.AppStates.UNKNOWN;
    }

    export function getBuildState(projectInfoPayload: any): BuildStates {
        const buildStatus: string | undefined = projectInfoPayload.buildStatus;

        if (buildStatus === "success") {
            return BuildStates.BUILD_SUCCESS;
        }
        else if (buildStatus === "inProgress") {
            return BuildStates.BUILDING;
        }
        else if (buildStatus === "queued") {
            return BuildStates.BUILD_QUEUED;
        }
        else if (buildStatus === "failed") {
            return BuildStates.BUILD_FAILED;
        }
        else if (buildStatus == null) {
            // This happens with disabled projects
            return BuildStates.UNKNOWN;
        }
        console.error("Unknown build state:", buildStatus);
        return BuildStates.UNKNOWN;
    }

    export function getAppStatusEmoji(state: ProjectState.AppStates): string {
        // ⚠ ▶ ⏹ ❌ ❓ ❗ ✅ 🐞
        switch (state) {
            case ProjectState.AppStates.DISABLED:
                return "🚫";
            case ProjectState.AppStates.STARTED:
                return "🔵";
            case ProjectState.AppStates.STOPPED:
                return "🔴";
            case ProjectState.AppStates.STARTING:
            case ProjectState.AppStates.STOPPING:
                return "⚪";
            case ProjectState.AppStates.DEBUGGING:
                return "🐞";
            default:
                return "❓";
        }
    }

    export function getBuildStatusEmoji(state: ProjectState.BuildStates): string {
        switch(state) {
            case ProjectState.BuildStates.BUILDING:
            case ProjectState.BuildStates.BUILD_QUEUED:
                return "🔨";
            case ProjectState.BuildStates.BUILD_FAILED:
                return "❌";
            default:
                return "❓";
        }
    }
}