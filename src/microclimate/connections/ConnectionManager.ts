import { Uri } from "vscode";
import { Connection } from "./Connection";

export default class ConnectionManager {

    private static _instance: ConnectionManager;

    private readonly connections: Connection[] = [];
    private readonly listeners: Function[] = [];

    private constructor() {
        ConnectionManager._instance = this;
    }

    public static get instance(): ConnectionManager {
        return ConnectionManager._instance || (ConnectionManager._instance = new this());
    }

    public async getConnections(): Promise<Connection[]> {
        return this.connections;
    }

    public static buildUrl(host: string, port: number): Uri {
        return Uri.parse(`http://${host}:${port}`);
    }

    public async addConnection(uri: Uri, workspace: Uri): Promise<void> {
        const connection: Connection = new Connection(uri, workspace);
        console.log("New Connection @" + uri);
        this.connections.push(connection);
        
        this.onChange();
    }

    public addOnChangeListener(callback: Function) {
        console.log("Adding onChangeListener " + callback.name);
        this.listeners.push(callback);
    }

    private onChange() {
        console.log("OnChange");
        this.listeners.forEach( (f) => f());
    }

}