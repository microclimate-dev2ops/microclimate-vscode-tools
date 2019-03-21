import * as vscode from "vscode";

import Log from "../../Logger";

export default class Syncer {

    constructor(
        public readonly workspacePath: vscode.Uri,
        public readonly masterHost: string,
    ) {

    }

    public async start(): Promise<void> {
        Log.i(`Starting syncing workspace ${this.workspacePath} to ${this.masterHost}`);
    }
}
