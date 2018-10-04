import * as io from "socket.io-client";
import * as vscode from "vscode";

import ConnectionManager from "./ConnectionManager";
import Connection from "./Connection";
import AppLog from "../logs/AppLog";
import Project from "../project/Project";
import * as restartProjectCmd from "../../command/RestartProjectCmd";

export default class MCSocket {

    private static readonly STATUS_SUCCESS = "success";

    private readonly socket: SocketIOClient.Socket;

    constructor(
        public readonly uri: string,
        private readonly connection: Connection
    ) {
        console.log("Creating MCSocket for URI", uri);
        this.socket = io(uri);

        this.socket.connect();

        this.socket
            .on("connect", () => {
                console.log("Connected to socket at " + uri);
            })
            .on("disconnect", () => {
                console.log("Disconnect from socket at " + uri);
            })
            .on("projectChanged",       this.onProjectChanged)
            .on("projectStatusChanged", this.onProjectChanged)
            .on("projectClosed",        this.onProjectChanged)

            .on("projectDeletion",       this.onProjectDeleted)
            .on("projectRestartResult",  this.onProjectRestarted)

            .on("container-logs", this.onContainerLogs);

            // We don't actually need the creation event -
            // we can create the project as needed if we get a 'changed' event for a project we don't recognize
            // .on("projectCreation",       this.onProjectCreatedOrDeleted);
    }

    private onProjectChanged = async (payload: any): Promise<void> => {
        console.log("onProjectChanged", payload);

        const projectID = payload.projectID;
        if (projectID == null) {
            console.error("No projectID in socket event!", payload);
            return;
        }

        const project: Project | undefined = await this.connection.getProjectByID(projectID);
        if (project == null) {
            console.log("No project with ID " + payload.projectID);
            // This means we've got a new project - refresh everything
            this.connection.forceProjectUpdate();
            return;
        }

        // TODO update application, debug ports, run/debug mode

        const changed: Boolean = project.setStatus(payload);
        if (changed) {
            ConnectionManager.instance.onChange();
        }
    }

    private onProjectDeleted = (payload: any): void => {
        console.log("PROJECT DELETED", payload);
        this.connection.forceProjectUpdate();
    }

    private onProjectRestarted = async (payload: any): Promise<void> => {
        console.log("PROJECT RESTARTED", payload);

        const projectID: string = payload.projectID;
        if (MCSocket.STATUS_SUCCESS !== payload.status) {
            console.error(`Restart failed on project ${projectID}, response is`, payload);
            if (payload.error != null) {
                // TODO decide if these messages are user-friendly enough
                vscode.window.showErrorMessage(payload.error);
            }
            return;
        }
        else if (payload.ports == null) {
            console.error("No ports were provided by supposedly successful restart event", payload);
            return;
        }

        const project: Project | undefined = await this.connection.getProjectByID(projectID);
        if (project == null) {
            console.error("Failed to get project associated with restart event, ID is ", projectID);
            return;
        }

        project.appPort = Number(payload.ports.exposedPort);

        const isDebug = payload.ports.exposedDebugPort != null;

        if (isDebug) {
            project.debugPort = Number(payload.ports.exposedDebugPort);
            try {
                const successMsg = await restartProjectCmd.startDebugSession(project);
                console.log("Debugger attach success", successMsg);
                vscode.window.showInformationMessage(successMsg);
            }
            catch (err) {
                console.error("Debugger attach failure", err);
                vscode.window.showErrorMessage(err);
            }
        }
        else {
            const doneRestartMsg = `Finished restarting ${project.name} in run mode.`;
            console.log(doneRestartMsg);
            vscode.window.showInformationMessage(doneRestartMsg);
        }
    }

    private onContainerLogs = (payload: any): void => {
        const projectID = payload.projectID;
        const projectName = payload.projectName;
        const logContents = payload.logs;

        const log = AppLog.getOrCreateLog(projectID, projectName);
        log.update(logContents);
    }

}