import ProjectType from "../microclimate/project/ProjectType";

// non-nls-file

// from https://github.ibm.com/dev-ex/microclimate/blob/master/docker/file-watcher/server/src/projects/constants.ts

enum StartModes {
    RUN = "run",
    DEBUG = "debug",
    DEBUG_NO_INIT = "debugNoInit"
}

export function allStartModes(): string[] {
    return [
        StartModes.RUN,
        StartModes.DEBUG,
        StartModes.DEBUG_NO_INIT
    ];
}

export function isDebugMode(startMode: string): boolean {
    return startMode === StartModes.DEBUG.toString() || startMode === StartModes.DEBUG_NO_INIT.toString();
}

export function getDefaultStartMode(debug: boolean, projectType: ProjectType.Types): StartModes {
    if (!debug) {
        return StartModes.RUN;
    }

    if (projectType === ProjectType.Types.MICROPROFILE) {
        return StartModes.DEBUG;
    }

    return StartModes.DEBUG_NO_INIT;
}

export default StartModes;
