
import AppLog from "./AppLog";
import BuildLog from "./BuildLog";
import Connection from "../connection/Connection";
// Not to be confused with the other log classes :)
import Log from "../../Logger";

/**
 * Contains info about app and build logs for a given Connection.
 * Manages creating logs, and handle properly Microclimate going down while we have logs open.
 */
export default class MCLogManager {

    // Maps projectIDs to Log instances
    private readonly appLogMap: Map<string, AppLog> = new Map<string, AppLog>();
    private readonly buildLogMap: Map<string, BuildLog> = new Map<string, BuildLog>();

    public constructor(
        private readonly connection: Connection
    ) {

    }

    public getOrCreateAppLog(projectID: string, projectName: string): AppLog {
        let appLog = this.appLogMap.get(projectID);
        if (appLog == null) {
            Log.i("Creating app log for " + projectName);
            // we have to create it
            appLog = new AppLog(projectID, projectName);
            this.appLogMap.set(projectID, appLog);
        }
        return appLog;
    }

    public getAppLog(projectID: string): AppLog | undefined {
        return this.appLogMap.get(projectID);
    }

    public getOrCreateBuildLog(projectID: string, projectName: string): BuildLog {
        let buildLog = this.buildLogMap.get(projectID);
        if (buildLog == null) {
            Log.i("Creating build log for " + projectName);
            // we have to create it
            buildLog = new BuildLog(this.connection, projectID, projectName);
            this.buildLogMap.set(projectID, buildLog);
        }
        return buildLog;
    }

    private getBuildLog(projectID: string): BuildLog | undefined {
        return this.buildLogMap.get(projectID);
    }

    public async destroyLogsForProject(projectID: string): Promise<void> {
        Log.d("Destroying logs for project " + projectID);
        const appLog = this.getAppLog(projectID);
        if (appLog != null) {
            appLog.destroy();
        }
        const buildLog = this.getBuildLog(projectID);
        if (buildLog != null) {
            buildLog.destroy();
        }
    }

    /**
     * When a connection dies, we have to stop updating its logs, but we should keep the logs visible.
     */
    public onConnectionDisconnect(): void {
        Log.d(`LogManager for ${this.connection.mcUri} onDisconnect`);
        this.appLogMap.forEach( (log) => {
            log.stopUpdating();
        });

        this.buildLogMap.forEach( (log) => {
            log.stopUpdating();
        });
    }

    /**
     * When a connection is reset, we have to wipe all the logs since the old logs are no longer valid.
     * The easiest way to is destroy them and start from scratch.
     */
    public onConnectionReconnect(): void {
        Log.d(`LogManager for ${this.connection.mcUri} onReconnect`);
        const oldAppLogs = new Map(this.appLogMap);
        this.appLogMap.clear();
        oldAppLogs.forEach( (log) => {
            log.destroy();
            this.getOrCreateAppLog(log.projectID, log.projectName);
        });

        const oldBuildLogs = new Map(this.buildLogMap);
        this.buildLogMap.clear();
        oldBuildLogs.forEach( (log) => {
            log.destroy();
            this.getOrCreateBuildLog(log.projectID, log.projectName);
        });
    }
}
