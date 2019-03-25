import * as vscode from "vscode";

import * as path from "path";

import Log from "../../../Logger";
import { ICPConnection } from "../ConnectionExporter";
import SyncthingUtil, { ISyncthingGuiData } from "./SyncthingUtil";

export default class Syncthing {

    private readonly executablePath: vscode.Uri;
    private readonly configDir: vscode.Uri;

    // private config?: ISyncthingConfig;

    constructor(
        public readonly connection: ICPConnection,
    ) {
        this.executablePath = SyncthingUtil.getExecutablePath();
        this.configDir = SyncthingUtil.getConnectionConfigDir(this.connection.masterHost);

        Log.i(`Created Syncthing for master host ${connection.masterHost}, ` +
            `exec path ${this.executablePath.fsPath}, config dir ${this.configDir.fsPath}`);
    }

    public async start(): Promise<void> {
        Log.i(`Starting syncing workspace ${this.connection.workspacePath} to ${this.connection.masterHost}`);
        const config = await this.getGuiData();
        // syncthing supports both http and https, certs for the latter are self-generated
        const syncthingProtocol = "http";
        const guiUrl = syncthingProtocol + "://" + config.guiUrl.toString();
        Log.d("Syncthing should be running at " + guiUrl);

        const logfile = `${this.configDir.fsPath}${path.sep}syncthing-${new Date().toLocaleTimeString()}.log`;
        Log.i("Syncthing logfile is " + logfile);
        // start syncthing - this process will continue to run,
        // so this promise will never resolve, but it will reject if syncthing exits with an error
        SyncthingUtil.syncthingExec(this.executablePath, [ `-home=${this.configDir.fsPath}`, `-logfile=${logfile}`, /*"-no-browser"*/ ]);
        // Don't return until syncthing has started
        await SyncthingUtil.pingSyncthing(guiUrl, config.apikey);
    }

    private async getGuiData(): Promise<ISyncthingGuiData> {
        if (!SyncthingUtil.doesConfigExist(this.configDir)) {
            Log.d("Generating syncthing config");
            await SyncthingUtil.syncthingExec(this.executablePath, [ "-generate=" + this.configDir.fsPath ], 10000);
            SyncthingUtil.writeMicroclimateConfig(this.configDir, this.connection.workspacePath);
        }

        return SyncthingUtil.getGuiDataFromConfig(this.configDir);
    }



}
