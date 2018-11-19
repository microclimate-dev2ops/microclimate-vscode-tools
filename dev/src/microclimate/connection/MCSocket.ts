import * as io from "socket.io-client";
import * as vscode from "vscode";

import Connection from "./Connection";
import Project from "../project/Project";
import ProjectState from "../project/ProjectState";
import attachDebuggerCmd from "../../command/AttachDebuggerCmd";
import Log from "../../Logger";
import Validator from "../project/Validator";
import EventTypes from "./EventTypes";
import * as StartModes from "../../constants/StartModes";

export default class MCSocket {

    private static readonly STATUS_SUCCESS: string = "success";

    private readonly socket: SocketIOClient.Socket;

    constructor(
        public readonly uri: string,
        private readonly connection: Connection
    ) {
        Log.i("Creating MCSocket for URI", uri);
        this.socket = io(uri);

        this.socket.connect();

        this.socket
            .on("connect",      this.connection.onConnect)
            .on("disconnect",   this.connection.onDisconnect)

            .on(EventTypes.PROJECT_CHANGED,         this.onProjectChanged)
            .on(EventTypes.PROJECT_STATUS_CHANGED,  this.onProjectStatusChanged)
            .on(EventTypes.PROJECT_CLOSED,          this.onProjectClosed)

            .on(EventTypes.PROJECT_DELETION,        this.onProjectDeleted)
            .on(EventTypes.PROJECT_RESTART_RESULT,  this.onProjectRestarted)

            .on(EventTypes.CONTAINER_LOGS,          this.onContainerLogs)
            .on(EventTypes.PROJECT_VALIDATED,       this.onProjectValidated);

            // We don't actually need the creation event -
            // we can create the project as needed if we get a 'changed' event for a project we don't recognize
            // .on("projectCreation",       this.onProjectCreatedOrDeleted);
    }

    /**
     * This MUST be called when the connection is removed.
     * If there are multiple sockets listening on the same connection,
     * the callbacks will be fired multiple times for the same event, which will lead to serious misbehaviour.
     */
    public async destroy(): Promise<void> {
        this.socket.disconnect();
    }

    private readonly onProjectStatusChanged = async (payload: any): Promise<void> => {
        // Logger.log("onProjectStatusChanged", payload);
        // I don't see any reason why these should be handled differently
        this.onProjectChanged(payload);
    }

    private readonly onProjectChanged = async (payload: any): Promise<void> => {
        // Logger.log("onProjectChanged", payload);
        // Logger.log(`PROJECT CHANGED name=${payload.name} appState=${payload.appStatus} ` +
                // `buildState=${payload.buildStatus} startMode=${payload.startMode}`);

        const projectID = payload.projectID;
        if (projectID == null) {
            Log.e("No projectID in changed socket event!", payload);
            return;
        }

        const project = await this.getProject(payload);
        if (project == null) {
            // This probably means we've got a new project - refresh everything
            Log.i("Received projectChanged for unknown project; refreshing project list");
            this.connection.forceUpdateProjectList();
            return;
        }

        project.update(payload);
    }

    private readonly onProjectClosed = async (payload: any): Promise<void> => {
        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        await project.clearValidationErrors();
        this.onProjectChanged(payload);
    }

    private readonly onProjectDeleted = async (payload: any): Promise<void> => {
        Log.i("PROJECT DELETED", payload);

        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        await project.onDelete();
        this.connection.forceUpdateProjectList();
    }

    private readonly onProjectRestarted = async (payload: any): Promise<void> => {
        Log.i("PROJECT RESTARTED", payload);

        const projectID: string = payload.projectID;
        if (MCSocket.STATUS_SUCCESS !== payload.status) {
            Log.e(`Restart failed on project ${projectID}, response is`, payload);
            if (payload.error != null) {
                vscode.window.showErrorMessage(payload.error.msg);
            }
            return;
        }
        else if (payload.ports == null) {
            // Should never happen
            const msg = "Successful restart did not send any ports";
            vscode.window.showErrorMessage(msg);
            Log.e(msg + ", payload:", payload);
            return;
        }

        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        Log.d("Restart event is valid");
        const startMode: string = payload.startMode;
        if (!StartModes.allStartModes().includes(startMode)) {
            Log.e(`Invalid start mode "${startMode}"`);
        }
        // This updates the ports and startMode, because those are what the payload will provide.
        project.update(payload);

        const isDebug = StartModes.isDebugMode(startMode);

        if (isDebug) {
            Log.d("Attaching debugger after restart");
            try {
                const success = await attachDebuggerCmd(project);
                if (success) {
                    Log.d("Debugger attach after restart returned success");
                }
                else {
                    // attachDebuggerCmd will display the error message
                    Log.w("Debugger attach after restart returned failure");
                    return;
                }
            }
            catch (err) {
                // I think all errors should be handled by attachDebuggerCmd, but just in case.
                Log.e("Error attaching debugger after restart", err);
                vscode.window.showErrorMessage(err);
                return;
            }
        }
        else {
            await project.waitForState(120 * 1000, ProjectState.AppStates.STARTED);
        }

        const doneRestartMsg = `Finished restarting ${project.name} in ${startMode} mode.`;
        Log.i(doneRestartMsg);
        vscode.window.showInformationMessage(doneRestartMsg);
    }

    private readonly onContainerLogs = async (payload: any): Promise<void> => {
        const projectID = payload.projectID;
        // const projectName = payload.projectName;
        const logContents = payload.logs;

        const log = this.connection.logManager.getAppLog(projectID);
        if (log != null) {
            log.update(logContents);
        }
    }

    private readonly onProjectValidated = async (payload: any): Promise<void> => {
        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        Validator.validate(project, payload);
    }

    private readonly getProject = async (payload: any): Promise<Project | undefined> => {
        const projectID = payload.projectID;
        if (projectID == null) {
            // Should never happen
            Log.e("No projectID in socket event!", payload);
            return undefined;
        }

        return this.connection.getProjectByID(projectID);
    }
}
