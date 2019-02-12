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

import Connection from "./Connection";
import Log from "../../Logger";
import Settings from "../../constants/Settings";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import ConnectionFactory from "./ConnectionFactory";
import MCEnvironment from "./MCEnvironment";
import { newConnectionCmd } from "../../command/NewConnectionCmd";

export default class ConnectionManager {

    private static _instance: ConnectionManager;

    private readonly _connections: Connection[] = [];
    private readonly listeners: Array<( () => void )> = [];

    public static async init(): Promise<ConnectionManager> {
        const connectionManager = new ConnectionManager();

        if (ConnectionManager._instance != null) {
            Log.e("Multiple ConnectionManager initializations!");
            return ConnectionManager._instance;
        }

        const connectionInfos: vscode.Uri[] = ConnectionManager.loadConnections();
        Log.i(`Loaded ${connectionInfos.length} connection(s)`, connectionInfos);

        connectionInfos.forEach((uri) =>
            ConnectionFactory.tryAddConnection(uri, true)
        );
        ConnectionManager._instance = connectionManager;

        Log.i("ConnectionManager initialized");
        return connectionManager;
    }

    public static get instance(): ConnectionManager {
        if (ConnectionManager._instance == null) {
            Log.e("ConnectionManager was not initialized");
        }
        return ConnectionManager._instance;
    }

    public get connections(): Connection[] {
        return this._connections;
    }

    public async addConnection(uri: vscode.Uri, isICP: boolean, mcVersion: number, workspace: string, user?: string):
        Promise<Connection> {

        // all validation that this connection is good must be done by this point

        const newConnection: Connection = new Connection(uri, isICP, mcVersion, workspace, user);
        Log.i("New Connection @ " + uri);
        this._connections.push(newConnection);
        ConnectionManager.saveConnections();

        this.onChange();
        return newConnection;
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

    /**
     * To be called on connection reconnect. Hits the environment endpoint at the given existing Connection's URI,
     * and returns if the response data matches the existing Connection.
     *
     * The given Connection will be destroyed if the data does not match (ie, this function returns `false`),
     * and thus must not do anything further.
     */
    public async verifyReconnect(connection: Connection): Promise<boolean> {
        Log.d("Verifying reconnect at " + connection.mcUri);

        let tries = 0;
        let newEnvData: MCEnvironment.IMCEnvData | undefined;
        // Sometimes this can execute before Portal is ready, resulting in a 404.
        while (newEnvData == null && tries < 10) {
            tries++;
            try {
                newEnvData = await MCEnvironment.getEnvData(connection.mcUri);
            }
            catch (err) {
                // wait briefly before trying again
                await new Promise( (resolve) => setTimeout(resolve, 250));
            }
        }

        if (newEnvData == null) {
            // I don't think this will ever happen
            Log.e("Couldn't get a good response from environment endpoint " + connection.mcUri);
            vscode.window.showErrorMessage(Translator.t(StringNamespaces.DEFAULT, "failedToReconnect", { uri: connection.mcUri }));

            await this.removeConnection(connection);
            return false;
        }

        let success = false;
        if (connection.isICP) {
            success = MCEnvironment.envMatchesICP(connection, newEnvData as MCEnvironment.IMCEnvDataICP);
        }
        else {
            success = MCEnvironment.envMatchesLocal(connection, newEnvData as MCEnvironment.IMCEnvDataLocal);
        }

        if (success) {
            // it's the same instance, so we don't have to do anything
            return true;
        }
        else {
            Log.d("Microclimate instance changed on reconnect!");
            await this.removeConnection(connection);

            // will also add the new Connection to this ConnectionManager
            const newConnection = await newConnectionCmd(connection.mcUri);
            if (newConnection == null) {
                // should never happen
                Log.e("Failed to create new connection after verifyReconnect failure");
                return false;
            }

            const msg = Translator.t(StringNamespaces.DEFAULT, "versionChanged",
                { uri: connection.mcUri, oldVersion: connection.versionStr, newVersion: newConnection.versionStr }
            );
            vscode.window.showInformationMessage(msg);
            return false;
        }
    }

    public connectionExists(uri: vscode.Uri): boolean {
        return this._connections.some( (conn) => {
            return conn.mcUri.toString() === uri.toString();
        });
    }

    private static loadConnections(): vscode.Uri[] {
        const globalState = global.extGlobalState as vscode.Memento;
        const loaded = globalState.get<string[]>(Settings.CONNECTIONS_KEY) || [];
        return loaded.map( (uri) => vscode.Uri.parse(uri));
    }

    /**
     * Save the list of connections as an array of URI strings.
     */
    private static async saveConnections(): Promise<void> {
        const connectionUris: string[] = ConnectionManager.instance.connections.map( (conn) => conn.mcUri.toString() );

        Log.d("Saving connections", connectionUris);
        try {
            const globalState = global.extGlobalState as vscode.Memento;
            // connectionInfos must not contain cyclic references (ie, JSON.stringify succeeds)
            await globalState.update(Settings.CONNECTIONS_KEY, connectionUris);
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
