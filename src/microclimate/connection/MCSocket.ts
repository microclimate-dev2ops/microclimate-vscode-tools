import * as io from "socket.io-client";
import ConnectionManager from "./ConnectionManager";
import Connection from "./Connection";

export default class MCSocket {

    private readonly socket: SocketIOClient.Socket;

    public readonly projectStateCallbacks: Map<string, Function> = new Map<string, Function>();

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

            .on("projectDeletion",       this.onProjectDeleted);

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
        
        setStateFunc(payload);
        ConnectionManager.instance.onChange();
    }

    private onProjectDeleted = (payload: any): void => {
        console.log("PROJECT DELETED", payload);
        this.connection.forceProjectUpdate();
    }

}