import * as vscode from "vscode";
import * as request from "request-promise-native";

import Log from "../../Logger";
import Endpoints from "../../constants/Endpoints";
import Connection from "../connection/Connection";
import MCLog from "./MCLog";
import Translator from "../../constants/strings/translator";

export default class BuildLog extends MCLog {

    private static readonly UPDATE_INTERVAL: number = 5000;
    private static readonly LAST_UPDATED_HEADER: string = "build-log-last-modified";        // non-nls

    private readonly timer: NodeJS.Timer;

    private lastUpdated: Date = new Date(0);

    constructor(
        private readonly connection: Connection,
        public readonly projectID: string,
        public readonly projectName: string
    ) {
        super(projectID, projectName,
            Translator.t(MCLog.STRING_NS, "waitingForBuildLogs", { projectName }),
            MCLog.LogTypes.BUILD);

        this.update();
        this.timer = setInterval(this.update, BuildLog.UPDATE_INTERVAL);
    }

    public update = async (): Promise<void> => {
        if (!this.doUpdate) {
            Log.e("Update was invoked on an buildLog with doUpdate=false, this should never happen!");
        }

        const buildLogUrl: string = Endpoints.getProjectEndpoint(this.connection, this.projectID, Endpoints.BUILD_LOG);

        try {
            const getResult = await request.get(buildLogUrl, { resolveWithFullResponse: true });
            const lastModifiedStr: string = getResult.headers[BuildLog.LAST_UPDATED_HEADER];
            const lastModified: Date = new Date(Number(lastModifiedStr));
            // Logger.log("buildlog-lastModified", lastModifiedStr, lastModified);

            if (lastModified == null || lastModified > this.lastUpdated) {
                Log.d("Updating " + this.outputChannel.name);
                this.lastUpdated = new Date(lastModified);
                // The build log doesn't get appended to, it's always totally new
                this.outputChannel.clear();
                this.outputChannel.appendLine(getResult.body);

                this.onChange();
            }
            /*
            else {
                Log.d(`${this.outputChannel.name} hasn't changed`);
            }*/
        }
        catch (err) {
            Log.e(err);
            if (err.statusCode === 404) {
                // The project got deleted or disabled
                return this.stopUpdating(false);
            }

            // Allow the user to kill this log so it doesn't spam them with error messages if there's a network problem or something.
            const stopUpdatingBtn: string = Translator.t(MCLog.STRING_NS, "stopUpdatingBtn");
            vscode.window.showErrorMessage(Translator.t(MCLog.STRING_NS, "errUpdatingBuildLog", { err: err.toString() }), stopUpdatingBtn)
                .then( (btn) => {
                    if (btn === stopUpdatingBtn) {
                        this.stopUpdating(false);
                    }
                });
        }
    }

    public async stopUpdating(connectionLost: boolean = true): Promise<void> {
        clearInterval(this.timer);
        super.stopUpdating(connectionLost);
    }

    public async showOutputChannel(): Promise<void> {
        this.update();
        super.showOutputChannel();
    }
}
