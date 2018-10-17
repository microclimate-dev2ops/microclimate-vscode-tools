import * as vscode from "vscode";

import * as MCUtil from "../../MCUtil";
import Connection from "./Connection";
import { tryAddConnection } from "../../command/NewConnectionCmd";

export default class ConnectionManager {

    private static readonly SETTINGS: string = "settings";
    private static readonly SETTINGS_KEY: string = "ext.mc.connections";

    private static _instance: ConnectionManager;

    private readonly _connections: Connection[] = [];
    private readonly listeners: ( () => void ) [] = [];

    private constructor(

    ) {
        const connectionUris: vscode.Uri[] = ConnectionManager.loadConnections();
        connectionUris.forEach( (uri) => {
            const hostPort: [string, number] | undefined = MCUtil.getHostPort(uri);
            if (hostPort != null) {
                tryAddConnection(hostPort[0], hostPort[1]);
            }
            else {
                // Should not happen
                const msg: string = `Failed to load Connection with malformed URI: ${uri}`;
                console.error(msg);
                vscode.window.showErrorMessage(msg);
            }
        })

        // add default connection
        // TODO just for testing
        const defaultHost = "localhost";
        const defaultPort = 9090;
        const defaultUri = MCUtil.buildMCUrl(defaultHost, defaultPort);
        if (!this.connectionExists(defaultUri)) {
            tryAddConnection(defaultHost, defaultPort);
        }
    }

    public static get instance(): ConnectionManager {
        return ConnectionManager._instance || (ConnectionManager._instance = new this());
    }

    public get connections(): Connection[] {
        return this._connections;
    }

    public async addConnection(uri: vscode.Uri, host: string, mcVersion: number, workspace: vscode.Uri): Promise<string> {
        return new Promise<string>( (resolve, reject) => {
            if (this.connectionExists(uri)) {
                return reject("Connection already exists at " + uri);
            }

            // all validation that this connection is good must be done by this point

            const connection: Connection = new Connection(uri, host, mcVersion, workspace);
            console.log("New Connection @ " + uri);
            this._connections.push(connection);
            ConnectionManager.saveConnections();

            this.onChange(connection);
            return resolve(`New connection to ${uri} succeeded.\nWorkspace path is: ${workspace}`);
        });
    }

    private connectionExists(uri: vscode.Uri): Boolean {
        return this._connections.some( (conn) => {
            return conn.mcUri.toString() === uri.toString();
        });
    }

    public static loadConnections(): vscode.Uri[] {
        console.log("Loading connections");
        const settings = vscode.workspace.getConfiguration(ConnectionManager.SETTINGS);
        return settings.get(ConnectionManager.SETTINGS_KEY, []);
    }

    public static async saveConnections(): Promise<void> {
        const connectionUris = ConnectionManager.instance.connections.map( (conn) => conn.mcUri);

        console.log("Saving connections", connectionUris);
        try {
            return vscode.workspace.getConfiguration(ConnectionManager.SETTINGS).update(ConnectionManager.SETTINGS_KEY, connectionUris);
        }
        catch(err) {
            console.error("Error saving connections", err);
        }
        console.log("Saved settings, now they are: ", vscode.workspace.getConfiguration(ConnectionManager.SETTINGS).get(ConnectionManager.SETTINGS_KEY));
    }

    /**
     * Pass this a function to call whenever a connection is added, removed, or changed,
     * eg to trigger a tree update in the UI.
     */
    public addOnChangeListener(callback: () => void): void {
        console.log("Adding onChangeListener " + callback.name);
        this.listeners.push(callback);
    }

    /**
     * Call this whenever a connection is added, removed, or changed.
     */
    public onChange = (_: Connection): void => {
        // console.log(`Connection ${connection} changed`);
        this.listeners.forEach( (f) => f());
    }
}