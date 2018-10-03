import * as io from "socket.io-client";
import ConnectionManager from "./ConnectionManager";
import Connection from "./Connection";

export default class MCSocket {

    private readonly socket: SocketIOClient.Socket;

    // Stores a list of Project.setState functions to call with the update event's payload every time a project's state changed
    // The callback function must match the given signature - accepts one any, and returns boolean indicating if a change was made
    public readonly projectStateCallbacks: Map<string, ( (payload: any) => Boolean )> = new Map<string, ( (payload: any) => Boolean )>();

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
            .on("projectRestartResult",  this.onProjectRestarted);

            // We don't actually need the creation event -
            // we can create the project as needed if we get a 'changed' event for a project we don't recognize
            // .on("projectCreation",       this.onProjectCreatedOrDeleted);
    }

    private onProjectChanged = (payload: any): void => {
        console.log("onProjectChanged", payload);

        const projectID = payload.projectID;
        if (projectID == null) {
            console.error("No projectID in socket event!");
            return;
        }

        const setStateFunc = this.projectStateCallbacks.get(projectID);
        if (setStateFunc == null) {
            console.log("No setState callback registered for project " + payload.projectID);
            // This means we've got a new project - refresh everything
            this.connection.forceProjectUpdate();
            return;
        }

        const changed: Boolean = setStateFunc(payload);
        if (changed) {
            ConnectionManager.instance.onChange();
        }
    }

    private onProjectDeleted = (payload: any): void => {
        console.log("PROJECT DELETED", payload);
        this.connection.forceProjectUpdate();
    }

    private onProjectRestarted = (payload: any): void => {
        console.log("PROJECT RESTARTED", payload);
    }

}