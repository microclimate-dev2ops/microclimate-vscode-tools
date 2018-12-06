/*******************************************************************************
 * Copyright (c) 2018 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import { expect } from "chai";
import * as vscode from "vscode";
import * as fs from "fs";

import Log from "../Logger";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import Commands from "../constants/Commands";

import SocketTestUtil from "./SocketTestUtil";
import ProjectObserver from "./ProjectObserver";

const workspace: vscode.Uri = vscode.Uri.file("/Users/tim/programs/microclimate/microclimate-workspace");
const extensionName = "IBM.vscode-microclimate-tools";

describe("Microclimate Tools for VSCode basic test", async function() {

    // The test needs to be launched with the microclimate-workspace open, so that the extension is activated.

    before("should have opened the workspace, and have loaded the extension", async function() {
        const wsFolders = vscode.workspace.workspaceFolders;
        Log.t("Workspace folders:", wsFolders);
        expect(wsFolders).to.have.length.greaterThan(0);
        if (wsFolders == null) {
            throw new Error("WSFolders can't be null after here.");
        }
        expect(wsFolders[0].uri.fsPath).to.equal(workspace.fsPath);

        Log.t("Loaded extensions:", vscode.extensions.all.map( (ext) => ext.id));
        const extension = vscode.extensions.getExtension(extensionName);
        expect(extension).to.exist;

        Log.t("Workspace is good and extension is loaded.");
        // Logger.silenceLevels(Logger.Levels.INFO);
    });

    it("should have a log file file that is readable and non-empty", async function() {
        const logPath = Log.getLogFilePath;

        expect(logPath).to.exist;
        Log.t("The logs are at " + logPath);

        fs.readFile(logPath, (err: NodeJS.ErrnoException, data) => {
            expect(err, "Couldn't read log file, error was " + err).to.be.null;
            const logContents = data.toString("utf8");
            expect(logContents).to.have.length.greaterThan(0, "Log existed but was empty!");
        });
    });

    it("should have no initial connections", async function() {
        const connMan = ConnectionManager.instance;
        expect(connMan).to.exist;

        const noConnections = connMan.connections.length;
        if (noConnections > 0) {
            Log.t("Clearing " + noConnections + " previous connection(s)");

            connMan.connections.forEach( async (conn) => {
                await vscode.commands.executeCommand(Commands.REMOVE_CONNECTION, conn);
            });
        }

        expect(connMan.connections.length).to.eq(0, "Connections exist when there should be none");
    });

    it("should create a new default Microclimate connection", async function() {
        this.timeout(10 * 1000);
        const connMan = ConnectionManager.instance;
        expect(connMan.connections.length).to.eq(0, "Connections exist when there should be none");

        await vscode.commands.executeCommand(Commands.NEW_DEFAULT_CONNECTION);
        Log.t("Finished default connection command");

        expect(connMan.connections.length).to.eq(1, "Failed to create new connection");

        const connection = connMan.connections[0];
        // expect(connection.isConnected).to.be.true;
        expect(connection.host).to.equal("localhost");
        expect(connection.mcUri.authority).to.contain("localhost:9090");
    });

    it("should have a test socket connection", async function() {
        const uri = ConnectionManager.instance.connections[0].mcUri.toString();
        const testSocket = await SocketTestUtil.createTestSocket(uri);
        expect(testSocket.connected, "Socket did not connect").to.be.true;
    });

    it("should initialize the ProjectObserver", async function() {
        const obs = new ProjectObserver(ConnectionManager.instance.connections[0]);
        expect(obs, "Failed to initialize ProjectObserver").to.exist;
        expect(obs.connection, "Failed to initialize ProjectObserver connection").to.exist;
    });
});
