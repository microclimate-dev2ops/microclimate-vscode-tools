import * as vscode from "vscode";

import Log from "../../Logger";
import Settings from "../../constants/Settings";

export class MCLog {

    protected readonly outputChannel: vscode.OutputChannel;

    protected doUpdate: boolean = true;

    protected constructor(
        public readonly projectID: string,
        public readonly projectName: string,
        initialMsg: string,
        private readonly logType: MCLog.LogTypes
    ) {
        const outputChannelName = `MC ${logType} Log - ${projectName}`;
        this.outputChannel = vscode.window.createOutputChannel(outputChannelName);
        this.outputChannel.appendLine(initialMsg);
    }

    public async showOutputChannel(): Promise<void> {
        this.outputChannel.show(true);
    }

    /**
     * Print a message to the bottom of the outputstream that this log won't be updated
     * until the 'show log' command is run again, and stop updating this log.
     *
     * @param connectionLost -
     *  A slightly different message is displayed if the updates were cancelled because we lost the MC connection.
     *  It is possible for a user to manually stop the updates of a build log, in which case this should be false.
     */
    public async stopUpdating(connectionLost: boolean = true): Promise<void> {
        if (!this.doUpdate) {
            Log.d("Already stopped updating log " + this.outputChannel.name);
            return;
        }

        Log.d("stopUpdating log " + this.outputChannel.name);

        // prevents printing the 'no more updates' message more than once
        this.doUpdate = false;

        const msgStart = connectionLost ? `The connection to Microclimate was lost, so this` : `This`;
        this.outputChannel.appendLine(`\n******** ${msgStart} ${this.logType.toLowerCase()} log is no longer updating.`);
    }

    public async destroy(): Promise<void> {
        Log.d("Destroy log " + this.outputChannel.name);
        this.stopUpdating();
        this.outputChannel.dispose();
    }

    protected onChange(): void {
        const setting: string = this.logType === MCLog.LogTypes.APP ? Settings.OPEN_ON_CHANGE_APP : Settings.OPEN_ON_CHANGE_BUILD;

        const showOnChange: boolean = vscode.workspace.getConfiguration(Settings.CONFIG_SECTION)
            .get(setting, false);

        if (showOnChange) {
            this.showOutputChannel();
        }
    }
}

export namespace MCLog {
    export enum LogTypes {
        BUILD = "Build",
        APP = "App"
    }
}

export default MCLog;
