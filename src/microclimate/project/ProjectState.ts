
export class ProjectState {

    public readonly state: ProjectState.States;
    public readonly statusEmoji: string;

    constructor(
        projectInfoPayload: any
    ) {
        if (projectInfoPayload == null) {
            this.state = ProjectState.States.UNKNOWN;
        }
        else {
            this.state = ProjectState.convert(projectInfoPayload);
        }

        this.statusEmoji = ProjectState.getStatusEmoji(this.state);
    }

    private static convert(projectInfoPayload: any): ProjectState.States {

        let appStatus: string = projectInfoPayload.appStatus || "";
        appStatus = appStatus.toLowerCase();

        const closedState: string | undefined = projectInfoPayload.state;
        const startMode:   string | undefined = projectInfoPayload.startMode;

        // console.log(`Convert - appStatus=${appStatus}, closedState=${closedState}, startMode=${startMode}`);

        if (closedState !== "open") {
            return ProjectState.States.DISABLED;
        }
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

    private static getStatusEmoji(state: ProjectState.States): string {
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
        }
        return " ";
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
}

