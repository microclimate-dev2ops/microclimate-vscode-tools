import * as io from "socket.io-client";
import * as vscode from "vscode";

import Connection from "./Connection";
import AppLog from "../logs/AppLog";
import Project from "../project/Project";
import * as restartProjectCmd from "../../command/RestartProjectCmd";
import { ProjectState } from "../project/ProjectState";
import * as MCUtil from "../../MCUtil";
import { getOcticon, Octicon } from "../../constants/Icons";

export default class MCSocket {

    private static readonly STATUS_SUCCESS: string = "success";

    private readonly socket: SocketIOClient.Socket;

    constructor(
        public readonly uri: string,
        private readonly connection: Connection
    ) {
        console.log("Creating MCSocket for URI", uri);
        this.socket = io(uri);

        this.socket.connect();

        this.socket
            .on("connect",      this.connection.onConnect)
            .on("disconnect",   this.connection.onDisconnect)

            .on("projectChanged",       this.onProjectChanged)
            .on("projectStatusChanged", this.onProjectStatusChanged)
            .on("projectClosed",        this.onProjectChanged)

            .on("projectDeletion",      this.onProjectDeleted)
            .on("projectRestartResult", this.onProjectRestarted)

            .on("container-logs",       this.onContainerLogs);

            // We don't actually need the creation event -
            // we can create the project as needed if we get a 'changed' event for a project we don't recognize
            // .on("projectCreation",       this.onProjectCreatedOrDeleted);
    }

    private onProjectStatusChanged = async (payload: any): Promise<void> => {
        // console.log("onProjectStatusChanged", payload);
        // I don't see any reason why these should be handled differently
        this.onProjectChanged(payload);
    }

    private onProjectChanged = async (payload: any): Promise<void> => {
        //console.log("onProjectChanged", payload);
        console.log(`PROJECT CHANGED name=${payload.name} appState=${payload.appStatus} ` +
                `buildState=${payload.buildStatus} startMode=${payload.startMode}`);

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

        project.update(payload);

        // TODO we have to check if a debugger (re)connection is needed
        // Eclipse plugin onProjectChanged:
        /*
         * if (portsObj.has(MCConstants.KEY_EXPOSED_DEBUG_PORT)) {
			int debugPort = parsePort(portsObj.getString(MCConstants.KEY_EXPOSED_DEBUG_PORT));
			app.setDebugPort(debugPort);
			if (serverBehaviour.getServer().getMode() == ILaunchManager.DEBUG_MODE && debugPort != -1) {
				// If the debug connection is lost then reconnect
				ILaunch launch = serverBehaviour.getServer().getLaunch();
				if (launch == null || launch.getLaunchMode() != ILaunchManager.DEBUG_MODE) {
					serverBehaviour.reconnectDebug(null);
				}
			}
		} else {
			app.setDebugPort(-1);
		}
         */
    }

    private onProjectDeleted = async (payload: any): Promise<void> => {
        console.log("PROJECT DELETED", payload);
        this.connection.forceProjectUpdate();
    }

    private onProjectRestarted = async (payload: any): Promise<void> => {
        console.log("PROJECT RESTARTED", payload);

        const projectID: string = payload.projectID;
        if (MCSocket.STATUS_SUCCESS !== payload.status) {
            console.error(`Restart failed on project ${projectID}, response is`, payload);
            if (payload.error != null) {
                vscode.window.showErrorMessage(payload.error.msg);
            }
            return;
        }
        else if (payload.ports == null) {
            // Should never happen
            const msg = "Successful restart did not send any ports";
            vscode.window.showErrorMessage(msg);
            console.error(msg + ", payload:", payload);
            return;
        }

        const project: Project | undefined = await this.connection.getProjectByID(projectID);
        if (project == null) {
            console.error("Failed to get project associated with restart event, ID is ", projectID);
            return;
        }

        const startMode = payload.startMode;
        if (startMode !== MCUtil.getStartMode(true) && startMode !== MCUtil.getStartMode(false)) {
            console.error(`Invalid start mode "${startMode}"`);
        }
        // This updates the ports and startMode.
        // The app state will not change because the projectRestartResult does not provide an appState.
        project.update(payload);

        const isDebug = startMode === MCUtil.getStartMode(true);

        if (isDebug) {
            try {
                const startDebugPromise = restartProjectCmd.startDebugSession(project);
                vscode.window.setStatusBarMessage(`${getOcticon(Octicon.bug, true)} Connecting debugger to ${project.name}`, startDebugPromise);
                const successMsg = await startDebugPromise;

                console.log("Debugger attach success", successMsg);
                vscode.window.showInformationMessage(successMsg);
            }
            catch (err) {
                console.error("Debugger attach failure", err);
                vscode.window.showErrorMessage("Failed to attach debugger: " + err);
                return;
            }
        }

        const stateToAwait = isDebug ? ProjectState.AppStates.DEBUGGING : ProjectState.AppStates.STARTED;
        try {
            await project.waitForState(stateToAwait);
        }
        catch (err) {
            // TODO
            vscode.window.showErrorMessage(err);
            console.error(err);
            return;
        }

        const doneRestartMsg = `Finished restarting ${project.name} in ${MCUtil.getStartMode(isDebug)} mode.`;
        console.log(doneRestartMsg);
        vscode.window.showInformationMessage(doneRestartMsg);
    }

    private onContainerLogs = async (payload: any): Promise<void> => {
        const projectID = payload.projectID;
        const projectName = payload.projectName;
        const logContents = payload.logs;

        const log = AppLog.getOrCreateLog(projectID, projectName);
        log.update(logContents);
    }

}