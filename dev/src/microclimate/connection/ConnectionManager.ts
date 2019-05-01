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

import * as MCUtil from "../../MCUtil";
import Connection from "./Connection";
import { tryAddConnection, newConnectionCmd } from "../../command/NewConnectionCmd";
import Log from "../../Logger";
import Settings from "../../constants/Settings";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import MCEnvironment from "./MCEnvironment";
import Project from "../project/Project";

export type OnChangeCallbackArgs = Connection | Project | undefined;

export default class ConnectionManager implements vscode.Disposable {

    private static _instance: ConnectionManager;

    private readonly _connections: Connection[] = [];
    private readonly listeners: Array<( (changed: OnChangeCallbackArgs) => void )> = [];

    private constructor(

    ) {
        const connectionInfos: MCUtil.IConnectionInfo[] = ConnectionManager.loadConnections();
        Log.i(`Loaded ${connectionInfos.length} connections from settings`);
        connectionInfos.forEach( (connInfo) =>
            // Note this is done async
            // We use tryAddConnection over newConnectionCmd because it succeeds silently (but still reports failure)
            tryAddConnection(connInfo)
        );
    }

    public static get instance(): ConnectionManager {
        return ConnectionManager._instance || (ConnectionManager._instance = new this());
    }

    public async dispose(): Promise<void> {
        return Promise.all(
            this.connections.map((conn) => conn.dispose())
        )
        .then(() => Promise.resolve());
    }

    public get connections(): Connection[] {
        return this._connections;
    }

    // public get allProjects(): Promise<Project[]> {
    //     return this.connections.reduce(async (allProjects: Promise<Project[]>, connection: Connection): Promise<Project[]> => {
    //         const projects = await connection.getProjects();
    //         return (await allProjects).concat(projects);
    //     }, Promise.resolve([]));
    // }

    public async addConnection(uri: vscode.Uri, host: string, mcVersion: number, socketNS: string, workspace: string): Promise<Connection> {
        if (this.connectionExists(uri)) {
            const alreadyExists = Translator.t(StringNamespaces.DEFAULT, "connectionAlreadyExists", { uri });
            // Log.i(alreadyExists);
            throw new Error(alreadyExists);
        }

        // all validation that this connection is good must be done by this point

        const newConnection: Connection = new Connection(uri, host, mcVersion, socketNS, workspace);
        Log.i("New Connection @ " + uri);
        this._connections.push(newConnection);
        ConnectionManager.saveConnections();

        // pass undefined here to refresh the tree from its root
        this.onChange(undefined);
        return newConnection;
    }

    public async removeConnection(connection: Connection): Promise<boolean> {
        const indexToRemove = this.connections.indexOf(connection);
        if (indexToRemove === -1) {
            Log.e(`Request to remove connection ${connection} but it doesn't exist!`);
            return false;
        }
        connection.dispose();
        this.connections.splice(indexToRemove, 1);
        Log.i("Removed connection", connection);
        ConnectionManager.saveConnections();
        this.onChange(undefined);
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

        if (MCEnvironment.envMatches(connection, newEnvData)) {
            // it's the same instance, so we don't have to do anything
            return true;
        }
        else {
            Log.d("Microclimate instance changed on reconnect!");
            await this.removeConnection(connection);

            // will also add the new Connection to this ConnectionManager
            const newConnection = await newConnectionCmd(MCUtil.getConnInfoFrom(connection.mcUri));
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

    private connectionExists(uri: vscode.Uri): boolean {
        return this._connections.some( (conn) => {
            return conn.mcUri.toString() === uri.toString();
        });
    }

    private static loadConnections(): MCUtil.IConnectionInfo[] {
        const globalState = global.extGlobalState as vscode.Memento;
        const loaded = globalState.get<MCUtil.IConnectionInfo[]>(Settings.CONNECTIONS_KEY) || [];
        return loaded;
    }

    private static async saveConnections(): Promise<void> {
        // We save IConnectionInfo objects since they are simpler and more readable than VSCode URIs.
        // This will likely change with ICP support since we would then have to store protocol too.
        const connectionInfos: MCUtil.IConnectionInfo[] = ConnectionManager.instance.connections
            .map( (connection) => MCUtil.getConnInfoFrom(connection.mcUri));

        Log.i("Saving connections", connectionInfos);
        try {
            const globalState = global.extGlobalState as vscode.Memento;
            // connectionInfos must not contain cyclic references (ie, JSON.stringify succeeds)
            await globalState.update(Settings.CONNECTIONS_KEY, connectionInfos);
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
    public addOnChangeListener(callback: (changed: OnChangeCallbackArgs) => void): void {
        Log.i("Adding onChangeListener " + callback.name);
        this.listeners.push(callback);
    }

    /**
     * Call this whenever a connection is added, removed, or changed.
     * Pass the item that changed (Connection or Project) or undefined for the tree's root.
     */
    public onChange = (changed: OnChangeCallbackArgs): void => {
        // Log.d(`There was a change, notifying ${this.listeners.length} listeners`);
        this.listeners.forEach((cb) => cb(changed));
    }
}
