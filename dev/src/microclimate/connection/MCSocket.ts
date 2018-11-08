import * as io from "socket.io-client";
import * as vscode from "vscode";

import Connection from "./Connection";
import AppLog from "../logs/AppLog";
import Project from "../project/Project";
import ProjectState from "../project/ProjectState";
import * as MCUtil from "../../MCUtil";
import attachDebuggerCmd from "../../command/AttachDebuggerCmd";
import Log from "../../Logger";
import Validator from "../project/Validator";
import EventTypes from "./EventTypes";
import StartModes, { allStartModes, isDebugMode } from "../../constants/StartModes";
import ProjectTreeDataProvider from "../../view/ProjectTree";
import projectInfoCmd from "../../command/ProjectInfoCmd";

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

    private onProjectStatusChanged = async (payload: any): Promise<void> => {
        // Logger.log("onProjectStatusChanged", payload);
        // I don't see any reason why these should be handled differently
        this.onProjectChanged(payload);
    }

    private onProjectChanged = async (payload: any): Promise<void> => {
        //Logger.log("onProjectChanged", payload);
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

    private onProjectClosed = async (payload: any): Promise<void> => {
        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        await project.clearValidationErrors();
        this.onProjectChanged(payload);
    }

    private onProjectDeleted = async (payload: any): Promise<void> => {
        Log.i("PROJECT DELETED", payload);

        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        await project.clearValidationErrors();
        this.connection.forceUpdateProjectList();
    }

    private onProjectRestarted = async (payload: any): Promise<void> => {
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

        const startMode: string = payload.startMode;
        if (allStartModes().indexOf(startMode) < 0) {
            Log.e(`Invalid start mode "${startMode}"`);
        }
        // This updates the ports and startMode, because those are what the payload will provide.
        project.update(payload);

        const isDebug = isDebugMode(startMode);

        if (isDebug) {
            try {
                await attachDebuggerCmd(project);
            }
            catch (err) {
                // I think all errors should be handled by attachDebuggerCmd, but just in case.
                Log.e("Error attaching debugger after restart", err);
            }
        }

        const stateToAwait = isDebug ? ProjectState.AppStates.DEBUGGING : ProjectState.AppStates.STARTED;
        try {
            await project.waitForState(60000, stateToAwait);
        }
        catch (err) {
            vscode.window.showErrorMessage(err);
            Log.e(err);
            return;
        }

        const doneRestartMsg = `Finished restarting ${project.name} in ${startMode} mode.`;
        Log.i(doneRestartMsg);
        vscode.window.showInformationMessage(doneRestartMsg);
    }

    private onContainerLogs = async (payload: any): Promise<void> => {
        const projectID = payload.projectID;
        // const projectName = payload.projectName;
        const logContents = payload.logs;

        const log = AppLog.getLogByProjectID(projectID);
        if (log != null) {
            log.update(logContents);
        }
    }

    private onProjectValidated = async (payload: any): Promise<void> => {
        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        Validator.validate(project, payload);
    }

    private async getProject(payload: any): Promise<Project | undefined> {
        const projectID = payload.projectID;
        if (projectID == null) {
            Log.e("No projectID in socket event!", payload);
            return undefined;
        }

        return this.connection.getProjectByID(projectID);
    }
}