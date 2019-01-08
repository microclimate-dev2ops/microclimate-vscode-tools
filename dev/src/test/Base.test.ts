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

import { expect } from "chai";
import * as vscode from "vscode";
import * as fs from "fs";

import Log from "../Logger";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import Commands from "../constants/Commands";

import SocketTestUtil from "./SocketTestUtil";
import ProjectObserver from "./ProjectObserver";
import TestConfig from "./TestConfig";
import Project from "../microclimate/project/Project";
import Connection from "../microclimate/connection/Connection";
import TestUtil from "./TestUtil";

const extensionID = "IBM.microclimate-tools";
// Will be re-used by other tests
export let testConnection: Connection;
// Set this to true when the connection set up and project creation succeeds
export let initializeSucceeded: boolean = false;

describe("Microclimate Tools for VSCode basic test", async function() {

    // The test needs to be launched with the microclimate-workspace open, so that the extension is activated.

    before("should have opened the workspace, and have loaded the extension", async function() {
        const wsFolders = vscode.workspace.workspaceFolders;
        Log.t("Workspace folders:", wsFolders);
        expect(wsFolders).to.have.length.greaterThan(0);
        const badWsMsg = "Active workspace is not a microclimate-workspace. Point the test launch configuration to your microclimate-workspace.";
        expect(wsFolders![0].uri.fsPath.endsWith("microclimate-workspace"), badWsMsg).to.be.true;

        Log.t("Loaded extensions:", vscode.extensions.all.map( (ext) => ext.id));
        const extension = vscode.extensions.getExtension(extensionID);
        expect(extension, `Extension ${extensionID} wasn't found!`).to.exist;
        expect(extension!.isActive, `Extension ${extensionID} wasn't activated!`).to.be.true;

        Log.t("Workspace is good and extension is loaded.");
        // Log.silenceLevels(Log.Levels.DEBUG);
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

            const removeProms = connMan.connections.map( (conn) => vscode.commands.executeCommand(Commands.REMOVE_CONNECTION, conn));
            await Promise.all(removeProms);
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

    it("Create test projects", async function() {
        // Long timeout because project creation is slow
        this.timeout(TestUtil.getMinutes(10));

        testConnection = ConnectionManager.instance.connections[0];
        expect(testConnection, "No Microclimate connection").to.exist;

        const createPromises: Array<Promise<Project | undefined>> = [];
        TestConfig.projectTypesToTest.forEach( (_, i) => {
            const testType = TestConfig.projectTypesToTest[i];
            Log.t(`Create ${testType.projectType.type} project`);

            const createPromise = TestUtil.createProject(testConnection, testType.projectType);
            createPromises.push(createPromise);

            createPromise
                .then( (p) => {
                    if (p != null) {
                        testType.projectID = p.id;
                        Log.t(`Created test project of type ${p.type.type} with name ${p.name} and ID ${p.id}`);
                    }
                    else {
                        Log.e("Failed to create test project of type " + testType.projectType);
                    }
                })
                .catch(
                    (err) => Log.e("Create test project threw error", err)
                );
        });
        Log.t("Awaiting test project creation");
        await Promise.all(createPromises);

        Log.t("Done creating test projects", TestConfig.projectTypesToTest);
        // If we made it this far, we can run the rest of the tests
        initializeSucceeded = true;
    });
});
