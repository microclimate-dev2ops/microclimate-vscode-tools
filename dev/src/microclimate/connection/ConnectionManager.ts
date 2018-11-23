import * as vscode from "vscode";

import * as MCUtil from "../../MCUtil";
import Connection from "./Connection";
import { tryAddConnection } from "../../command/NewConnectionCmd";
import Log from "../../Logger";
import Settings from "../../constants/Settings";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";

export default class ConnectionManager {

    private static _instance: ConnectionManager;

    private readonly _connections: Connection[] = [];
    private readonly listeners: Array<( () => void )> = [];

    private constructor(

    ) {
        const connectionInfos: MCUtil.IConnectionInfo[] = ConnectionManager.loadConnections();
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
                return reject(Translator.t(StringNamespaces.DEFAULT, "connectionAlreadyExists", { uri }));
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

    public async removeConnection(connection: Connection): Promise<boolean> {
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

    private connectionExists(uri: vscode.Uri): boolean {
        return this._connections.some( (conn) => {
            return conn.mcUri.toString() === uri.toString();
        });
    }

    public static loadConnections(): MCUtil.IConnectionInfo[] {
        const loaded = vscode.workspace.getConfiguration(Settings.CONFIG_SECTION)
                .get(Settings.CONNECTIONS_KEY, []);

        // Logger.log("LOADED CONNECTIONS", loaded);
        return loaded;
    }

    public static async saveConnections(): Promise<void> {
        // We save IConnectionInfo objects since they are simpler and more readable than VSCode URIs.

        // This is a bit tough to read - For each connection, convert it to a connInfo we can save nicely.
        // If the convert fails, ignore it and log an error.
        const connectionInfos: MCUtil.IConnectionInfo[] = ConnectionManager.instance.connections.reduce(
            (result: MCUtil.IConnectionInfo[], conn: Connection): MCUtil.IConnectionInfo[] => {
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
            return vscode.workspace.getConfiguration(Settings.CONFIG_SECTION)
                    .update(Settings.CONNECTIONS_KEY, connectionInfos, vscode.ConfigurationTarget.Global);
        }
        catch (err) {
            const msg = Translator.t(StringNamespaces.DEFAULT, "errorSavingConnections", { err: err.toString() });
            Log.e(msg, err);
            vscode.window.showErrorMessage(msg);
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
     * Test-friendly.
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
