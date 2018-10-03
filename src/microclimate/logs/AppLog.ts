import * as vscode from "vscode";

export default class AppLog {

    // Maps projectIDs to AppLog instances
    public static readonly logMap: Map<string, AppLog> = new Map<string, AppLog>();

    private readonly outputChannel: vscode.OutputChannel;

    private initialized: Boolean = false;
    private previousLength: number = 0;

    constructor(
        public readonly projectID: string,
        projectName: string
    ) {
        this.outputChannel = vscode.window.createOutputChannel(projectName);
        this.outputChannel.appendLine("Waiting for Microclimate to send application logs...");
        this.outputChannel.show();
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
}