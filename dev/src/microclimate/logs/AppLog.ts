// import * as vscode from "vscode";

import MCLog from "./MCLog";
import Log from "../../Logger";
import Translator from "../../constants/strings/translator";

export default class AppLog extends MCLog {

    private initialized: boolean = false;
    private previousLength: number = 0;

    constructor(
        public readonly projectID: string,
        public readonly projectName: string,
        managerMap: Map<string, MCLog>
    ) {
        super(projectID, projectName, MCLog.LogTypes.APP,
            managerMap,
            Translator.t(MCLog.STRING_NS, "waitingForAppLogs", { projectName }),
        );
        // update will be invoked when we get a container-logs event
    }

    public async update(contents: string): Promise<void> {
        if (!this.doUpdate) {
            Log.e("Update was invoked on an applog with doUpdate=false, this should never happen!");
        }

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
        this.onChange();
    }
}
