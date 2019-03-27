import * as vscode from "vscode";
import Log from "../../../Logger";

// export enum MCLogTypes {
//     "app", "build",
// }

const FW_CONTAINER_LOGS_NAME = "-";
const PORTAL_CONTAINER_LOGS_NAME = "container";
const USER_CONTAINER_LOGS_NAME = "container log";

export default class MCLog implements vscode.QuickPickItem {

    private readonly displayName: string;

    // quickPickItem
    public readonly label: string;

    private output: vscode.OutputChannel | undefined;

    constructor(
        projectName: string,
        // MUST match the logName provided in the events
        public readonly logName: string,
        // public readonly logType: MCLogTypes,
        // path is not used at this time
        public readonly logPath?: string,
    ) {
        // portal sends the logName for container logs (in log-update events) as "container", but filewatcher sends "-" (in REST requests)
        // so we have to deal with that here, normalize to the portal name
        const isContainerLog = logName === FW_CONTAINER_LOGS_NAME;
        if (isContainerLog) {
            this.logName = PORTAL_CONTAINER_LOGS_NAME;
        }

        this.displayName = projectName + " - " + (isContainerLog ? USER_CONTAINER_LOGS_NAME : this.logName);
        this.label = this.displayName;
        // this.description = `(${this.logType} log)`;

        Log.i(`Initialized log ${this.displayName} internal name ${this.logName}`);
    }

    public onNewLogs(reset: boolean, logs: string): void {
        if (!this.output) {
            return;
        }

        if (reset) {
            // Log.d("Reset " + this.displayName);
            this.output.clear();
        }
        // Log.d(`${this.displayName} appending length ${logs.length}`);
        this.output.append(logs);
    }

    public get isOpen(): boolean {
        return this.output != null;
    }

    // quickPickItem
    public get picked(): boolean {
        return this.isOpen;
    }

    public removeOutput(): void {
        // Log.d("Hide log " + this.displayName);
        if (this.output) {
            this.output.dispose();
            this.output = undefined;
        }
    }

    public showOutput(): void {
        // Log.d("Show log " + this.displayName);
        if (!this.output) {
            // Log.d("Creating output for log " + this.displayName);
            this.output = vscode.window.createOutputChannel(this.displayName);
            this.output.show();
            this.output.appendLine("Waiting for Microclimate to send logs...");
        }
    }

    public onConnectionDisconnect(): void {
        if (this.output) {
            this.output.appendLine("********* Disconnected from Microclimate");
        }
    }

    public destroy(): void {
        this.removeOutput();
    }
}
