/*******************************************************************************
 * Copyright (c) 2018 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as io from "socket.io-client";

import Connection from "./Connection";
import Project from "../project/Project";
import Log from "../../Logger";
import Validator from "../project/Validator";
import SocketEvents from "./SocketEvents";

/**
 * Receives and reacts to socket events from Portal
 *
 * Each Connection has exactly one socket
 */
export default class MCSocket {

    private readonly socket: SocketIOClient.Socket;

    constructor(
        public readonly uri: string,
        private readonly connection: Connection
    ) {
        Log.i("Creating MCSocket for URI", uri);
        this.socket = io(uri);

        this.socket.connect();

        this.socket
            .on("connect",      this.connection.onConnect)      // non-nls
            .on("disconnect",   this.connection.onDisconnect)   // non-nls

            .on(SocketEvents.Types.PROJECT_CHANGED,         this.onProjectChanged)
            .on(SocketEvents.Types.PROJECT_STATUS_CHANGED,  this.onProjectStatusChanged)
            .on(SocketEvents.Types.PROJECT_CLOSED,          this.onProjectClosed)

            .on(SocketEvents.Types.PROJECT_DELETION,        this.onProjectDeleted)
            .on(SocketEvents.Types.PROJECT_RESTART_RESULT,  this.onProjectRestarted)

            .on(SocketEvents.Types.CONTAINER_LOGS,          this.onContainerLogs)
            .on(SocketEvents.Types.PROJECT_VALIDATED,       this.onProjectValidated);

            // We don't actually need the creation event -
            // we can create the project as needed if we get a 'changed' event for a project we don't recognize
            // .on("projectCreation",       this.onProjectCreatedOrDeleted);
    }

    public toString(): string {
        return "MCSocket @ " + this.uri;
    }

    public toJSON(): string {
        return this.toString();
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
        // Log.d("onProjectStatusChanged", payload);
        // I don't see any reason why these should be handled differently
        this.onProjectChanged(payload);
    }

    private readonly onProjectChanged = async (payload: any): Promise<void> => {
        // Log.d("onProjectChanged", payload);
        // Log.d(`PROJECT CHANGED name=${payload.name} appState=${payload.appStatus} ` +
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

    private readonly onProjectClosed = async (payload: { projectID: string }): Promise<void> => {
        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        await project.clearValidationErrors();
        this.onProjectChanged(payload);
    }

    private readonly onProjectDeleted = async (payload: { projectID: string }): Promise<void> => {
        Log.d("PROJECT DELETED", payload);

        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        await project.onDelete();
        this.connection.forceUpdateProjectList();
    }

    private readonly onProjectRestarted = async (payload: SocketEvents.IProjectRestartedEvent): Promise<void> => {
        Log.d("PROJECT RESTARTED", payload);

        // Validate the restart event
        const project = await this.getProject(payload);
        if (project == null) {
            Log.e("Received restart event for unrecognized project:", payload);
            return;
        }

        project.onRestartEvent(payload);
    }

    private readonly onContainerLogs = async (payload: { projectID: string, logs: string }): Promise<void> => {
        const projectID = payload.projectID;
        // const projectName = payload.projectName;
        const logContents = payload.logs;

        const log = this.connection.logManager.getAppLog(projectID);
        if (log != null) {
            log.update(logContents);
        }
    }

    private readonly onProjectValidated = async (payload: { projectID: string, validationResults: SocketEvents.IValidationResult[] })
        : Promise<void> => {

        const project = await this.getProject(payload);
        if (project == null) {
            return;
        }

        if (payload.validationResults != null) {
            Validator.validate(project, payload.validationResults);
        }
        else {
            Log.e("Microclimate didn't send result with validation event");
        }
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
