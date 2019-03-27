import Project from "../Project";
import MCLog from "./MCLog";
import Log from "../../../Logger";
import Requester from "../Requester";
import SocketEvents from "../../connection/SocketEvents";

export default class MCLogManager {

    private readonly _logs: MCLog[] = [];
    public readonly initPromise: Promise<void>;

    private readonly managerName: string;

    constructor(
        private readonly project: Project,
    ) {
        this.initPromise = this.initialize();
        this.managerName = `${this.project.name} LogManager`;
    }

    private async initialize(): Promise<void> {
        if (this._logs.length > 0) {
            Log.e(this.managerName + " logs have already been initialized");
            return;
        }
        Log.d("Initializing logs");
        const availableLogs = await Requester.requestAvailableLogs(this.project);

        availableLogs.app.concat(availableLogs.build).forEach((log) => {
            this.logs.push(new MCLog(this.project.name, log.logName, log.workspathLogPath));
        });
        Log.i(`${this.managerName} has finished initializing ${this.logs.length} logs`);
    }

    /**
     * @param enable `true` to refresh (ie, restart) all logs for this project, `false` to stop streaming all logs for this project
     */
    public async toggleLogStreaming(enable: boolean): Promise<void> {
        Log.d(`${this.managerName} log streaming now ${enable}`);
        await Requester.requestToggleLogs(this.project, enable);
    }

    public onNewLogs(event: SocketEvents.ILogUpdateEvent): void {
        if (event.projectID !== this.project.id) {
            Log.e(`${this.managerName} received logs for other project ${event.projectName}`);
            return;
        }
        const existingLog = this.logs.find((log) => log.logName === event.logName);
        if (existingLog != null) {
            existingLog.onNewLogs(event.reset, event.logs);
        }
    }

    public onConnectionReconnect(): void {
        Log.d(`${this.managerName} onConnectionReconnect`);
        // refresh all streams
        this.toggleLogStreaming(true);
    }

    public onConnectionDisconnect(): void {
        this.logs.forEach((log) => log.onConnectionDisconnect());
    }

    public get logs(): MCLog[] {
        return this._logs;
    }

    public destroy(): void {
        this.logs.forEach((log) => log.destroy());
    }
}
