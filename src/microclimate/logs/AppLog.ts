import * as vscode from "vscode";

export default class AppLog {

    // Maps projectIDs to AppLog instances
    private static readonly logMap: Map<string, AppLog> = new Map<string, AppLog>();

    private readonly outputChannel: vscode.OutputChannel;

    // If this project is being debugged, we also have to send the output to the debug console.
    private debugConsole: vscode.DebugConsole | undefined;
    private hasNewDebugConsole: Boolean = false;

    private initialized: Boolean = false;
    private previousLength: number = 0;

    constructor(
        public readonly projectID: string,
        projectName: string
    ) {
        // TODO improve the outputChannel name
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
        if (this.hasNewDebugConsole) {
            // TODO this doesn't work
            if (this.debugConsole != null) {
                // one time only, send the whole output to the debug console
                this.debugConsole.append(contents);
                this.hasNewDebugConsole = false;
            }
            else {
                console.error("Unexpected null debug console");
            }
        }
        // It's normal for debugConsole to be null if we're not debugging.
        else if (this.debugConsole != null) {
            this.debugConsole.append(newContents);
        }

        this.previousLength = contents.length;
    }

    public async showOutputChannel() {
        this.outputChannel.show();
    }

    public static getOrCreateLog(projectID: string, projectName: string): AppLog {
        let log = this.logMap.get(projectID);
        if (log == null) {
            console.log("Creating app log for " + projectName);
            // we have to create it
            log = new AppLog(projectID, projectName);
            AppLog.logMap.set(projectID, log);
        }
        return log;
    }

    /*
    public static getLogByProjectID(projectID: string): AppLog | undefined {
        return this.logMap.get(projectID);
    }*/
    public setDebugConsole(console: vscode.DebugConsole) {
        this.debugConsole = console;
        this.hasNewDebugConsole = true;
    }

    public unsetDebugConsole() {
        this.debugConsole = undefined;
        this.hasNewDebugConsole = false;
    }
}