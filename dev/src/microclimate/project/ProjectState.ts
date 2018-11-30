import Log from "../../Logger";
import * as StartModes from "../../constants/StartModes";

// Project info keys sent by Microclimate. These are the keys in projectInfoPayload
const KEY_APP_STATE:    string = "appStatus";               // non-nls
const KEY_BUILD_STATE:  string = "buildStatus";             // non-nls
const KEY_CLOSED_STATE: string = "state";                   // non-nls
const KEY_START_MODE:   string = "startMode";               // non-nls
const KEY_BUILD_DETAIL: string = "detailedBuildStatus";     // non-nls

/**
 * Represents the project's state in Microclimate. This means app state, build state, and any status details.
 *
 * Immutable
 */
export class ProjectState {
    public readonly appState: ProjectState.AppStates;
    public readonly buildState: ProjectState.BuildStates;
    public readonly buildDetail: string;

    constructor(
        projectInfoPayload: any,
        // Use oldState if the projectInfoPayload is missing state information (eg. from a restart success event)
        // It will be used as fallback values if the new state is null or UNKNOWN.
        oldState?: ProjectState
    ) {
        if (projectInfoPayload != null) {
            if (oldState != null) {
                if (projectInfoPayload[KEY_APP_STATE] == null) {
                    projectInfoPayload[KEY_APP_STATE] = oldState.appState.toString();
                }
                if (projectInfoPayload[KEY_BUILD_STATE] == null) {
                    projectInfoPayload[KEY_BUILD_STATE] = oldState.buildState.toString();
                }
                if (!projectInfoPayload[KEY_BUILD_DETAIL]) {
                    projectInfoPayload[KEY_BUILD_DETAIL] = oldState.buildDetail;
                }
            }

            this.appState = ProjectState.getAppState(projectInfoPayload);
            this.buildState = ProjectState.getBuildState(projectInfoPayload);
            this.buildDetail = projectInfoPayload[KEY_BUILD_DETAIL] || "";
        }
        else {
            Log.e("ProjectState received null ProjectInfo");
            this.appState = ProjectState.AppStates.UNKNOWN;
            this.buildState = ProjectState.BuildStates.UNKNOWN;
            this.buildDetail = "";
        }
    }

    public get isEnabled(): boolean {
        return ProjectState.getEnabledStates().includes(this.appState);
    }

    public get isStarted(): boolean {
        return ProjectState.getStartedStates().includes(this.appState);
    }

    public get isBuilding(): boolean {
        return this.buildState === ProjectState.BuildStates.BUILDING;
    }

    public toString(): string {
        const appState = this.appState.toString();

        if (this.isEnabled) {
            let result = `[${appState}]`;               // non-nls

            const buildStr = this.getBuildString();
            if (buildStr != null && buildStr.length > 0) {
                result += ` [${buildStr}]`;             // non-nls
            }
            return result;
        }
        else {
            // don't show build detail for disabled projects
            return `[${appState}]`;                     // non-nls
        }
    }

    public getBuildString(): string | undefined {
        if (!this.isEnabled) {
            return undefined;
        }

        let buildStateStr = "";

        if (this.buildDetail != null && this.buildDetail.trim() !== "") {
            // a detailed status is available
            buildStateStr = `${this.buildState} - ${this.buildDetail}`;         // non-nls
        }
        // Don't display the build state if it's unknown
        else if (this.buildState !== ProjectState.BuildStates.UNKNOWN) {
            buildStateStr = `${this.buildState}`;                               // non-nls
        }
        return buildStateStr;
    }
}

export namespace ProjectState {

    // The AppStates and BuildStates string values are all exposed to the user.

    // These _should_ be translated, but since you can't put computed values in a string enum,
    // we can cross that bridge when we come to it :)
    export enum AppStates {
        STARTED = "Running",
        STARTING = "Starting",
        STOPPING = "Stopping",
        STOPPED = "Stopped",

        DEBUGGING = "Debugging",
        DEBUG_STARTING = "Starting - Debug",

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
        return [
            AppStates.STARTED,
            AppStates.STARTING,
            AppStates.STOPPING,
            AppStates.STOPPED,
            AppStates.DEBUGGING,
            AppStates.DEBUG_STARTING,
            AppStates.UNKNOWN
        ];
    }

    export function getStartedStates(): AppStates[] {
        return [
            ProjectState.AppStates.STARTED,
            ProjectState.AppStates.DEBUGGING
        ];
    }

    export function getDebuggableStates(): AppStates[] {
        return [
            ProjectState.AppStates.DEBUGGING,
            ProjectState.AppStates.DEBUG_STARTING
        ];
    }

    /**
     * Convert Microclimate's project info object into a ProjectState.
     */
    export function getAppState(projectInfoPayload: any): ProjectState.AppStates {

        // Logger.log("PIP", projectInfoPayload);
        const appStatus: string = projectInfoPayload[KEY_APP_STATE] as string || "";

        const closedState: string | undefined = projectInfoPayload[KEY_CLOSED_STATE];
        const startMode:   string | undefined = projectInfoPayload[KEY_START_MODE];

        // Logger.log(`Convert - appStatus=${appStatus}, closedState=${closedState}, startMode=${startMode}`);

        // First, check if the project is closed (aka Disabled)
        if (closedState === "closed" || appStatus === AppStates.DISABLED) {                                                     // non-nls
            return ProjectState.AppStates.DISABLED;
        }
        // Now, check the app states. Compare against both the value we expect from MC,
        // as well as our own possible values, in case we used the fallbackState in the constructor.
        else if (appStatus === "started" || appStatus === AppStates.DEBUGGING || appStatus === AppStates.STARTED) {             // non-nls
            if (startMode != null && StartModes.isDebugMode(startMode)) {
                return ProjectState.AppStates.DEBUGGING;
            }
            return ProjectState.AppStates.STARTED;
        }
        else if (appStatus === "starting" || appStatus === AppStates.STARTING || appStatus === AppStates.DEBUG_STARTING) {      // non-nls
            if (startMode != null && StartModes.isDebugMode(startMode)) {
                return ProjectState.AppStates.DEBUG_STARTING;
            }
            return ProjectState.AppStates.STARTING;
        }
        else if (appStatus === "stopping" || appStatus === AppStates.STOPPING) {                        // non-nls
            return ProjectState.AppStates.STOPPING;
        }
        else if (appStatus === "stopped" || appStatus === AppStates.STOPPED) {                          // non-nls
            return ProjectState.AppStates.STOPPED;
        }
        else if (appStatus === "unknown" || appStatus === "" || appStatus === AppStates.UNKNOWN) {      // non-nls
            return ProjectState.AppStates.UNKNOWN;
        }
        else {
            Log.e("Unknown app state:", appStatus);
            return ProjectState.AppStates.UNKNOWN;
        }
    }

    export function getBuildState(projectInfoPayload: any): BuildStates {
        const buildStatus: string | undefined = projectInfoPayload[KEY_BUILD_STATE];

        if (buildStatus === "success" || buildStatus === BuildStates.BUILD_SUCCESS) {           // non-nls
            return BuildStates.BUILD_SUCCESS;
        }
        else if (buildStatus === "inProgress" || buildStatus === BuildStates.BUILDING) {        // non-nls
            return BuildStates.BUILDING;
        }
        else if (buildStatus === "queued" || buildStatus === BuildStates.BUILD_QUEUED) {        // non-nls
            return BuildStates.BUILD_QUEUED;
        }
        else if (buildStatus === "failed" || buildStatus === BuildStates.BUILD_FAILED) {        // non-nls
            return BuildStates.BUILD_FAILED;
        }
        else if (buildStatus == null || buildStatus.toLowerCase() === "unknown") {              // non-nls
            return BuildStates.UNKNOWN;
        }
        else {
            Log.e("Unknown build state:", buildStatus);
            return BuildStates.UNKNOWN;
        }
    }
}

export default ProjectState;
