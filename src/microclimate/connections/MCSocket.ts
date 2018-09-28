import * as io from "socket.io-client";

export default class MCSocket {

    private readonly socket: SocketIOClient.Socket;

    constructor(
        public readonly uri: string
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
            .on("projectChanged",       MCSocket.onProjectChanged)
            .on("projectStatusChanged", MCSocket.onProjectStatusChanged)
            .on("projectClosed",        MCSocket.onProjectClosed)
            .on("projectDeleted",       MCSocket.onProjectDeleted);
    }

    private static onProjectChanged(payload: JSON) {
        console.log("onProjectChanged", payload);
    }

    private static onProjectStatusChanged(payload: JSON) {
        console.log("onProjectStatusChanged", payload);
    }

    private static onProjectClosed(payload: JSON) {
        console.log("onProjectClosed", payload);
    }

    private static onProjectDeleted(payload: JSON) {
        console.log("onProjectDeleted", payload); 
    }
}