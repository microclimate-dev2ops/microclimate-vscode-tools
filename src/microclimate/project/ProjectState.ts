
export class ProjectState {
    private readonly state: ProjectState.AppStates;
    private readonly buildState: ProjectState.BuildStates;
    private readonly buildDetail: string;

    constructor (
        projectInfoPayload: any
    ) {
        if (projectInfoPayload == null) {
            // console.error("Passed null project info to ProjectState");
            this.state = ProjectState.AppStates.UNKNOWN;
            this.buildState = ProjectState.BuildStates.UNKNOWN;
            this.buildDetail = "";
        }
        else {
            this.state = ProjectState.getAppState(projectInfoPayload);
            this.buildState = ProjectState.getBuildState(projectInfoPayload);
            this.buildDetail = projectInfoPayload.detailedBuildStatus || "";
        }
    }

    public get isStarted(): Boolean {
        return this.state === ProjectState.AppStates.STARTED;
    }

    public get isBuilding(): Boolean {
        const buildingStates = [
            ProjectState.BuildStates.BUILDING,
            ProjectState.BuildStates.BUILD_QUEUED
        ];

        return buildingStates.indexOf(this.buildState) >= 0;
    }

    public toString(): string {
        const appState = this.state.toString();

        let buildStateStr = "";
        if (this.buildDetail != null && this.buildDetail.trim() !== "") {
            // a detailed status is available
            buildStateStr = `[${this.buildState} - ${this.buildDetail}]`;
        }
        // Don't display the build state if it's unknown
        else if (this.buildState !== ProjectState.BuildStates.UNKNOWN) {
            buildStateStr = `[${this.buildState}]`;
        }

        return `[${appState}] ${buildStateStr}`;
    }
}

export namespace ProjectState {

    export enum AppStates {
        STARTED = "Started",        // maybe should be "Running" to match web UI
        STARTING = "Starting",
        STOPPING = "Stopping",
        STOPPED = "Stopped",
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
        if (closedState !== "open") {
            return ProjectState.AppStates.DISABLED;
        }
        // Now, check the app states.
        else if (appStatus === "started") {
            if (startMode === "debug") {
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
        console.error("Unknown app state " + appStatus);
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
        console.error("Unknown build state " + buildStatus);
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

