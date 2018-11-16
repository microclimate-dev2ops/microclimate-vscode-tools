import * as vscode from "vscode";

import * as MCUtil from "../../MCUtil";
import Connection from "./Connection";
import { tryAddConnection } from "../../command/NewConnectionCmd";
import { Log } from "../../Logger";

export default class ConnectionManager {

    private static readonly CONFIG_SECTION: string = "microclimate";
    private static readonly CONNECTIONS_KEY: string = "connections";

    private static _instance: ConnectionManager;

    private readonly _connections: Connection[] = [];
    private readonly listeners: ( () => void ) [] = [];

    private constructor (

    ) {
        const connectionInfos: MCUtil.ConnectionInfo[] = ConnectionManager.loadConnections();
        Log.i(`Loaded ${connectionInfos.length} connections from settings`);
        connectionInfos.forEach((connInfo) =>
            tryAddConnection(connInfo)
        );
    }

    public static get instance(): ConnectionManager {
        return ConnectionManager._instance || (ConnectionManager._instance = new this());
    }

    public get connections(): Connection[] {
        return this._connections;
    }

    public async addConnection(uri: vscode.Uri, host: string, mcVersion: number, workspace: vscode.Uri): Promise<Connection> {
        return new Promise<Connection>( (resolve, reject) => {
            if (this.connectionExists(uri)) {
                return reject("Connection already exists at " + uri);
            }

            // all validation that this connection is good must be done by this point

            const newConnection: Connection = new Connection(uri, host, mcVersion, workspace);
            Log.i("New Connection @ " + uri);
            this._connections.push(newConnection);
            ConnectionManager.saveConnections();

            this.onChange();
            return resolve(newConnection);
        });
    }

    public async removeConnection(connection: Connection): Promise<Boolean> {
        const indexToRemove = this.connections.indexOf(connection);
        if (indexToRemove === -1) {
            Log.e(`Request to remove connection ${connection} but it doesn't exist!`);
            return false;
        }
        connection.destroy();
        this.connections.splice(indexToRemove, 1);
        Log.i("Removed connection", connection);
        ConnectionManager.saveConnections();
        this.onChange();
        return true;
    }

    private connectionExists(uri: vscode.Uri): Boolean {
        return this._connections.some( (conn) => {
            return conn.mcUri.toString() === uri.toString();
        });
    }

    public static loadConnections(): MCUtil.ConnectionInfo[] {
        const loaded = vscode.workspace.getConfiguration(ConnectionManager.CONFIG_SECTION)
                .get(ConnectionManager.CONNECTIONS_KEY, []);

        // Logger.log("LOADED CONNECTIONS", loaded);
        return loaded;
    }

    public static async saveConnections(): Promise<void> {
        // We save ConnectionInfo objects since they are simpler and more readable.

        // This is a bit tough to read - For each connection, convert it to a connInfo we can save nicely.
        // If the convert fails, ignore it and log an error.
        const connectionInfos: MCUtil.ConnectionInfo[] = ConnectionManager.instance.connections.reduce(
            (result: MCUtil.ConnectionInfo[], conn: Connection): MCUtil.ConnectionInfo[] => {
                const connInfo = MCUtil.getConnInfoFrom(conn.mcUri);
                if (connInfo != null) {
                    result.push(connInfo);
                }
                else {
                    // shouldn't happen
                    Log.e("Couldn't convert mcURI to connInfo!", conn.mcUri);
                }
                return result;
            },
        []);

        Log.i("Saving connections", connectionInfos);
        try {
            return vscode.workspace.getConfiguration(ConnectionManager.CONFIG_SECTION)
                    .update(ConnectionManager.CONNECTIONS_KEY, connectionInfos, vscode.ConfigurationTarget.Global);
        }
        catch(err) {
            const msg = "Error saving connections: " + err;
            Log.e(msg);
            vscode.window.showErrorMessage(err);
        }
    }

    /*
    public async getProjectByID(projectID: string): Promise<Project | undefined> {
        for (const conn of this.connections) {
            const proj: Project | undefined = await conn.getProjectByID(projectID);
            if (proj != null) {
                return proj;
            }
        }
        return undefined;
    }*/

    /**
     * Pass this a function to call whenever a connection is added, removed, or changed,
     * eg to trigger a tree update in the UI.
     */
    public addOnChangeListener(callback: () => void): void {
        Log.i("Adding onChangeListener " + callback.name);
        this.listeners.push(callback);
    }

    /**
     * Call this whenever a connection is added, removed, or changed.
     */
    public onChange = (): void => {
        // Logger.log(`Connection ${connection} changed`);
        this.listeners.forEach( (f) => f());
    }
}