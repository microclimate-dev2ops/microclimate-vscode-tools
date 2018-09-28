
// TODO rename, or figure out how to make an enum that is also a class
export class ProjectStates {
    public static convert(appStatus: string, closedState?: string, startMode?: string): ProjectState {
        appStatus = appStatus.toLowerCase();
    
        if (closedState !== "open") {
            return ProjectState.DISABLED;
        }
        else if (appStatus === "started") {
            if (startMode === "debug") {
                return ProjectState.DEBUGGING;
            }
            return ProjectState.STARTED;
        }
        else if (appStatus === "starting") {
            return ProjectState.STARTING;
        }
        else if (appStatus === "stopping") {
            return ProjectState.STOPPING;
        }
        else if (appStatus === "stopped") {
            return ProjectState.STOPPED;
        }    
    
        return ProjectState.UNKNOWN;
    }
}

export enum ProjectState {
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

