/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import Log from "../../Logger";
import Settings from "../../constants/Settings";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import ConnectionFactory from "./ConnectionFactory";
import MCEnvironment from "./MCEnvironment";
import { newDefaultLocalConnectionCmd, newConnectionCmd } from "../../command/NewConnectionCmd";
import { IConnectionData, ISaveableConnectionData, ConnectionData } from "./ConnectionData";
import { Connection, ICPConnection } from "./ConnectionExporter";

export default class ConnectionManager {

    private static _instance: ConnectionManager;

    private readonly _connections: Connection[] = [];
    private readonly listeners: Array<( () => void )> = [];

    public static async init(): Promise<ConnectionManager> {
        if (ConnectionManager._instance != null) {
            Log.e("Multiple ConnectionManager initializations!");
            return ConnectionManager._instance;
        }
        ConnectionManager._instance = new ConnectionManager();

        Log.i("ConnectionManager initialized");
        return ConnectionManager._instance;
    }

    public static get instance(): ConnectionManager {
        if (ConnectionManager._instance == null) {
            Log.e("ConnectionManager was not initialized");
        }
        return ConnectionManager._instance;
    }

    /**
     * Load connections and try to re-establish an initial connection.
     * Should be called after the TreeView is initialized.
     */
    public async onPostActivation(): Promise<void> {
        Log.d("Doing initial connection load");
        const connectionDatas: IConnectionData[] = ConnectionManager.loadConnections();
        Log.i(`Loaded ${connectionDatas.length} connection(s)`, connectionDatas);

        const reAddConnectionPromises = Array<Promise<Connection>>();
        connectionDatas.forEach( (connectionData) => {
            const urlAsString = connectionData.url.toString();
            if (!urlAsString || urlAsString === "undefined") {
                // This happens if the connection was saved by an older version of the tools, before ConnectionData was introduced.
                // That version would have only supported localhost, so we can assume this is a local connection.
                newDefaultLocalConnectionCmd();
                return;
            }
            reAddConnectionPromises.push(ConnectionFactory.reAddConnection(connectionData));
        });

        await Promise.all(reAddConnectionPromises);
    }

    public get connections(): Connection[] {
        return this._connections;
    }

    /**
     * Create a connection from the given data, wait for it to be ready, and save it.
     * This is the only place from which we should be calling `new Connection`.
     */
    public async addConnection(isICP: boolean, connectionData: IConnectionData): Promise<Connection> {

        // all validation that this connection is good must be done by this point

        let newConnection: Connection;
        if (isICP) {
            newConnection = new ICPConnection(connectionData);
            await (newConnection as ICPConnection).initialize();
        }
        else {
            newConnection = new Connection(connectionData);
        }
        this._connections.push(newConnection);
        ConnectionManager.saveConnections();

        this.onChange();
        return newConnection;
    }

    public async removeConnection(connection: Connection, isRefresh: boolean = false): Promise<boolean> {
        const indexToRemove = this.connections.indexOf(connection);
        if (indexToRemove === -1) {
            Log.e(`Request to remove connection ${connection} but it doesn't exist!`);
            return false;
        }
        connection.destroy(isRefresh);
        this.connections.splice(indexToRemove, 1);
        Log.i("Removed connection", connection);
        ConnectionManager.saveConnections();
        this.onChange();
        return true;
    }

    /**
     * To be called on connection reconnect. Hits the environment endpoint at the given existing Connection's URI,
     * and returns if the response data matches the existing Connection.
     *
     * The given Connection will be destroyed if the data does not match (ie, this function returns `false`),
     * and thus must not do anything further.
     */
    public async verifyReconnect(connection: Connection): Promise<boolean> {
        Log.d("Verifying reconnect at " + connection.mcUrl);

        let tries = 0;
        let newEnvData: MCEnvironment.IMCEnvData | undefined;
        // Sometimes this can execute before Portal is ready, resulting in a 404.
        while (newEnvData == null && tries < 10) {
            tries++;
            try {
                newEnvData = await MCEnvironment.getEnvData(connection.mcUrl);
            }
            catch (err) {
                // wait briefly before trying again
                await new Promise( (resolve) => setTimeout(resolve, 250));
            }
        }

        if (newEnvData == null) {
            // I don't think this will ever happen
            Log.e("Couldn't get a good response from environment endpoint " + connection.mcUrl);
            vscode.window.showErrorMessage(Translator.t(StringNamespaces.DEFAULT, "failedToReconnect", { uri: connection.mcUrl }));

            await this.removeConnection(connection);
            return false;
        }

        if (MCEnvironment.envMatches(connection, newEnvData)) {
            // it's the same instance, so we don't have to do anything
            return true;
        }
        else {
            Log.d("Microclimate instance changed on reconnect!");
            await this.removeConnection(connection);

            // will also add the new Connection to this ConnectionManager
            let newConnection;
            if (connection.isICP()) {
                newConnection = await newConnectionCmd();
            }
            else {
                newConnection = await newDefaultLocalConnectionCmd();
            }

            if (newConnection == null) {
                // should never happen
                Log.e("Failed to create new connection after verifyReconnect failure");
                return false;
            }

            const msg = Translator.t(StringNamespaces.DEFAULT, "versionChanged",
                { uri: connection.mcUrl, oldVersion: connection.versionStr, newVersion: newConnection.versionStr }
            );
            vscode.window.showInformationMessage(msg);
            return false;
        }
    }

    public connectionExists(uri: vscode.Uri): boolean {
        return this._connections.some( (conn) => {
            return conn.mcUrl.toString() === uri.toString();
        });
    }

    private static loadConnections(): IConnectionData[] {
        const globalState = global.extGlobalState as vscode.Memento;
        const saveableDatas = globalState.get<ISaveableConnectionData[]>(Settings.CONNECTIONS_KEY) || [];
        return saveableDatas.map(ConnectionData.convertFromSaveable);
    }

    /**
     * Save the list of connections as an array of URI strings.
     */
    private static async saveConnections(): Promise<void> {
        const saveableConnectionDatas: ISaveableConnectionData[] = ConnectionManager.instance.connections.map( (conn) => {
            const data = ConnectionData.getConnectionData(conn);
            return ConnectionData.convertToSaveable(data);
        });

        Log.d("Saving connections", saveableConnectionDatas);
        try {
            const globalState = global.extGlobalState as vscode.Memento;
            // connectionInfos must not contain cyclic references (ie, JSON.stringify succeeds)
            await globalState.update(Settings.CONNECTIONS_KEY, saveableConnectionDatas);
        }
        catch (err) {
            const msg = Translator.t(StringNamespaces.DEFAULT, "errorSavingConnections", { err: err.toString() });
            Log.e(msg, err);
            vscode.window.showErrorMessage(msg);
        }
    }

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
