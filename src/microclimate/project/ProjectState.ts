
export class ProjectState {
    public static convert(projectInfoPayload: any): ProjectState {

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

