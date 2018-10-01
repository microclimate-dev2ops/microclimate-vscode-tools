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
            .on("projectDeleted",       this.onProjectChanged)
            .on("projectCreated",       this.onProjectCreated);

            //.on("projectClosed",        this.onProjectClosed)
            //.on("projectDeleted",       this.onProjectDeleted);
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
            console.error("No setState callback registered for project " + payload.projectID);
            return;
        }
        
        setStateFunc(payload);
        ConnectionManager.instance.onChange();
    }

    private onProjectCreated = (payload: any): void => {
        console.log("PROJECT CREATED", payload);
        this.connection.forceProjectUpdate();
    }

    /*
    private onProjectStatusChanged(payload: JSON) {
        console.log("onProjectStatusChanged", payload);
    }

    private onProjectClosed(payload: JSON) {
        console.log("onProjectClosed", payload);
    }

    private onProjectDeleted(payload: JSON) {
        console.log("onProjectDeleted", payload); 
    }*/
}