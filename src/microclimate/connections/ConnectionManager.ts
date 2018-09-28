import { Uri } from "vscode";
import { Connection } from "./Connection";

export default class ConnectionManager {

    private static _instance: ConnectionManager;

    private readonly _connections: Connection[] = [];
    private readonly listeners: Function[] = [];

    private constructor() {
        ConnectionManager._instance = this;

            // TODO just for ease of testing
            this.connections.push(new Connection(ConnectionManager.buildUrl("localhost", 9090), Uri.file("/Users/tim/programs/microclimate/microclimate-workspace")));
    }

    public static get instance(): ConnectionManager {
        return ConnectionManager._instance || (ConnectionManager._instance = new this());
    }

    public get connections(): Connection[] {
        return this._connections;
    }

    public static buildUrl(host: string, port: number): Uri {
        return Uri.parse(`http://${host}:${port}`);
    }

    public async addConnection(uri: Uri, workspace: Uri): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.connectionExists(uri)) {
                return reject("Connection already exists at " + uri);
            }
    
            const connection: Connection = new Connection(uri, workspace);
            console.log("New Connection @ " + uri);
            this._connections.push(connection);
    
            this.onChange();
            return resolve();
        });
    }

    private connectionExists(uri: Uri): Boolean {
        return this._connections.some((conn) => {
            return conn.mcUri.toString() === uri.toString();
        });
    }

    public addOnChangeListener(callback: () => void): void {
        console.log("Adding onChangeListener " + callback.name);
        this.listeners.push(callback);
    }

    private onChange(): void {
        console.log("OnChange");
        this.listeners.forEach( (f) => f());
    }

}