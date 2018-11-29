import * as vscode from "vscode";

import Log from "../../Logger";
import Settings from "../../constants/Settings";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Translator from "../../constants/strings/translator";

/**
 * Type to capture common functionality between AppLogs and BuildLogs
 */
export class MCLog implements vscode.QuickPickItem {

    protected static readonly STRING_NS: StringNamespaces = StringNamespaces.LOGS;

    protected readonly outputChannel: vscode.OutputChannel;

    protected doUpdate: boolean = true;

    // quickPickItem
    public readonly label: string;

    protected constructor(
        public readonly projectID: string,
        public readonly projectName: string,
        public readonly logType: MCLog.LogTypes,
        private readonly managerMap: Map<string, MCLog>,
        initialMsg: string
    ) {
        const outputChannelName = Translator.t(MCLog.STRING_NS, "logName", { projectName, logType: logType.toString() });
        this.outputChannel = vscode.window.createOutputChannel(outputChannelName);
        this.outputChannel.appendLine(initialMsg);

        // quickPickItem
        this.label = this.outputChannel.name;
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
    public stopUpdating(connectionLost: boolean = true): void {
        if (!this.doUpdate) {
            Log.d("Already stopped updating log " + this.outputChannel.name);
            return;
        }

        Log.d("stopUpdating log " + this.outputChannel.name);

        // prevents printing the 'no more updates' message more than once
        this.doUpdate = false;

        const msgKey = connectionLost ? "logNotUpdatingNoConnection" : "logNotUpdatingOther";       // non-nls
        const msg = Translator.t(MCLog.STRING_NS, msgKey, { logType: this.logType.toString().toLowerCase() });

        this.outputChannel.appendLine("\n" + msg);          // non-nls
    }

    /**
     * Disposes of this log's OutputChannel.
     * Also removes it from the owner manager's log map, which is a nasty coupling I will revisit!
     */
    public destroy(): void {
        Log.d("Destroy log " + this.outputChannel.name);
        this.stopUpdating();
        this.outputChannel.dispose();
        if (this.managerMap.has(this.projectID)) {
            this.managerMap.delete(this.projectID);
        }
    }

    /**
     * Call this whenever this log gets updated. It will show the log if the user has that preference set.
     */
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
