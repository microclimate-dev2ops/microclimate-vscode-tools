import * as vscode from "vscode";
import { Log } from "../../Logger";

export default class AppLog {

    // Maps projectIDs to AppLog instances
    private static readonly logMap: Map<string, AppLog> = new Map<string, AppLog>();

    private readonly outputChannel: vscode.OutputChannel;

    private initialized: boolean = false;
    private previousLength: number = 0;

    constructor(
        public readonly projectID: string,
        projectName: string
    ) {
        // TODO see if there's a better way to sort these, or prefix them
        this.outputChannel = vscode.window.createOutputChannel("App Log - " + projectName);
        this.outputChannel.appendLine("Waiting for Microclimate to send application logs...");
        // this.outputChannel.show();
    }

    public async update(contents: string): Promise<void> {
        if (!this.initialized) {
            this.initialized = true;
            this.outputChannel.clear();
        }

        let newContents;
        const diff = contents.length - this.previousLength;
        if (diff === 0) {
            // no new output
            return;
        }
        else if (diff < 0) {
            // the log was cleared, eg due to container restart
            this.outputChannel.clear();
            newContents = contents;
        }
        else {
            // get only the new output
            newContents = contents.substring(this.previousLength, contents.length);
        }

        this.outputChannel.append(newContents);
        this.previousLength = contents.length;
    }

    public async showOutputChannel(): Promise<void> {
        this.outputChannel.show(true);
    }

    public static getOrCreateLog(projectID: string, projectName: string): AppLog {
        let log = this.logMap.get(projectID);
        if (log == null) {
            Log.i("Creating app log for " + projectName);
            // we have to create it
            log = new AppLog(projectID, projectName);
            AppLog.logMap.set(projectID, log);
        }
        return log;
    }

    public static getLogByProjectID(projectID: string): AppLog | undefined {
        return this.logMap.get(projectID);
    }
}
