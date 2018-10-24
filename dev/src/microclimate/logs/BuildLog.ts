import * as vscode from "vscode";
import * as request from "request-promise-native";

import { Logger } from "../../Logger";
import Endpoints from "../../constants/Endpoints";
import Project from "../project/Project";
import Connection from "../connection/Connection";

export default class BuildLog {

    private static readonly UPDATE_INTERVAL: number = 5000;
    private static readonly LAST_UPDATED_HEADER: string = "build-log-last-modified";

    // Maps projectIDs to BuildLog instances
    private static readonly logMap: Map<string, BuildLog> = new Map<string, BuildLog>();

    private readonly outputChannel: vscode.OutputChannel;

    private readonly timer: NodeJS.Timer;

    private lastUpdated: Date = new Date(0);

    constructor(
        private readonly connection: Connection,
        public readonly projectID: string,
        projectName: string
    ) {
        this.outputChannel = vscode.window.createOutputChannel("Build Log - " + projectName);
        this.outputChannel.appendLine(`Fetching build logs for ${projectName}...`);
        this.showOutputChannel();

        this.update();
        this.timer = setInterval(this.update, BuildLog.UPDATE_INTERVAL);
    }

    public update = async (): Promise<void> => {
        const buildLogUrl: string = Endpoints.getProjectEndpoint(this.connection, this.projectID, Endpoints.BUILD_LOG);

        try {
            const getResult = await request.get(buildLogUrl, { resolveWithFullResponse: true });
            const lastModifiedStr: string = getResult.headers[BuildLog.LAST_UPDATED_HEADER];
            const lastModified: Date = new Date(Number(lastModifiedStr));
            // Logger.log("buildlog-lastModified", lastModifiedStr, lastModified);

            if (lastModified == null || lastModified > this.lastUpdated) {
                Logger.log("Updating build logs"); // new body", getResult.body);
                this.lastUpdated = new Date(lastModified);
                // The build log doesn't get appended to, it's always totally new
                this.outputChannel.clear();
                this.outputChannel.appendLine(getResult.body);
                this.showOutputChannel();
            }
            /*
            else {
                Logger.log(`${this.outputChannel.name} hasn't changed`);
            }*/
        }
        catch (err) {
            Logger.logE(err);
            if (err.statusCode === 404) {
                // The project got deleted or disabled
                return this.destroy();
            }

            // Allow the user to kill this log so it doesn't spam them with error messages.
            const removeLogBtn: string = "Remove Log";
            vscode.window.showErrorMessage("Error updating build log: " + err, removeLogBtn)
                .then( (btn) => {
                    if (btn === removeLogBtn) {
                        this.destroy();
                    }
                });
        }
    }

    private async destroy(): Promise<void> {
        Logger.log("Destroy build log " + this.outputChannel.name);
        // this.outputChannel.dispose();
        clearInterval(this.timer);
    }

    public async showOutputChannel(): Promise<void> {
        this.update();
        this.outputChannel.show(true);
    }

    public static getOrCreateLog(project: Project): BuildLog {
        let log = this.logMap.get(project.id);
        if (log == null) {
            Logger.log("Creating build log for " + project.name);
            // we have to create it
            log = new BuildLog(project.connection, project.id, project.name);
            BuildLog.logMap.set(project.id, log);
        }
        return log;
    }
}