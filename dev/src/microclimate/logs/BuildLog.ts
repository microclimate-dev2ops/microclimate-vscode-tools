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

    private lastUpdated: Date = new Date(0);

    constructor(
        private readonly connectionUrl: Connection,
        public readonly projectID: string,
        projectName: string
    ) {
        this.outputChannel = vscode.window.createOutputChannel("Build Log - " + projectName);
        this.outputChannel.appendLine(`Fetching build logs for ${projectName}...`);
        this.outputChannel.show();

        this.update();
        setInterval(this.update, BuildLog.UPDATE_INTERVAL);
    }

    public update = async (): Promise<void> => {
        const buildLogUrl: vscode.Uri = Endpoints.getEndpointPath(this.connectionUrl, Endpoints.BUILD_LOG(this.projectID));

        try {
            const getResult = await request.get(buildLogUrl.toString(), { resolveWithFullResponse: true });
            const lastModifiedStr: string = getResult.headers[BuildLog.LAST_UPDATED_HEADER];
            const lastModified: Date = new Date(Number(lastModifiedStr));
            // Logger.log("buildlog-lastModified", lastModifiedStr, lastModified);

            if (lastModified == null || lastModified > this.lastUpdated) {
                Logger.log("Updating build logs"); // new body", getResult.body);
                this.lastUpdated = new Date(lastModified);
                // The build log doesn't get appended to, it's always totally new
                this.outputChannel.clear();
                this.outputChannel.appendLine(getResult.body);
                this.outputChannel.show();
            }
            /*
            else {
                Logger.log(`${this.outputChannel.name} hasn't changed`);
            }*/
        }
        catch(err) {
            vscode.window.showErrorMessage("Error updating build log: " + err);
            Logger.logE(err);
        }
    }

    public async showOutputChannel(): Promise<void> {
        this.outputChannel.show();
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