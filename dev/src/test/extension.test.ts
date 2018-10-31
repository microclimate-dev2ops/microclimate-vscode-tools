//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

import { expect } from "chai";
import * as vscode from 'vscode';
import * as fs from "fs";

import { Logger } from "../Logger";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import Commands from "../constants/Commands";
import { ProjectType } from "../microclimate/project/ProjectType";
import Project from "../microclimate/project/Project";
import { ProjectState } from "../microclimate/project/ProjectState";
import * as SocketTestUtil from "./SocketTestUtil";

// Defines a Mocha test suite to group tests of similar kind together
describe("Microclimate Tools for VSCode Microprofile test", function() {

    const workspace = "/Users/tim/programs/microclimate/microclimate-workspace";
    const extensionName = "IBM:vscode-microclimate-tools";
    let testSocket: SocketIOClient.Socket;

    // The test needs to be launched with the microclimate-workspace open, so that the extension is activated.
    before(async function() {
        const wsFolders = vscode.workspace.workspaceFolders;
        console.log("Workspace folders:", wsFolders);
        expect(wsFolders).to.not.be.null
        expect(wsFolders).to.have.length.greaterThan(0);
        if (wsFolders == null) {
            throw new Error("WSFolders can't be null after here.");
        }
        expect(wsFolders[0].uri.fsPath).to.equal(workspace);

        const extension = await vscode.extensions.getExtension(extensionName);
        expect(extension).to.not.be.null;

        console.log("Workspace is good and extension is loaded.");
    });

    it("should have a log file file that is readable and non-empty", async function() {
        const logPath = Logger.getLogFilePath;

        expect(logPath).to.not.be.null;
        console.log("The logs are at " + logPath);

        fs.readFile(logPath, (err: NodeJS.ErrnoException, data) => {
            expect(err, "Couldn't read log file, error was " + err).to.be.null;
            const logContents = data.toString("utf8");
            expect(logContents).to.have.length.greaterThan(0, "Log existed but was empty!");
        });
    });

    it("should initially have no connections", async function() {
        const connMan = ConnectionManager.instance;
        expect(connMan).to.not.be.null;

        const noConnections = connMan.connections.length;
        if (noConnections > 0) {
            console.log("Clearing " + noConnections + " previous connection(s)");

            connMan.connections.forEach( async (conn) => {
                await connMan.removeConnection(conn);
            });
        }

        expect(connMan.connections.length).to.eq(0, "Connections exist when there should be none");
    });

    it("should create a new default Microclimate connection", async function() {
        const connMan = ConnectionManager.instance;
        expect(connMan.connections.length).to.eq(0, "Connections exist when there should be none");

        await vscode.commands.executeCommand(Commands.NEW_DEFAULT_CONNECTION);
        console.log("Finished default connection command");

        expect(connMan.connections.length).to.eq(1, "Failed to create new connection");

        const connection = connMan.connections[0];
        // expect(connection.isConnected).to.be.true;
        expect(connection.host).to.equal("localhost");
        expect(connection.mcUri.authority).to.contain("localhost:9090");

        testSocket = await SocketTestUtil.createTestSocket(connection.mcUri.toString());
        expect(testSocket.connected, "Socket did not connect").to.be.true;
    });


    it("should be able to restart a Microprofile project in Run mode", async function() {

        this.timeout(120000);

        const conn = ConnectionManager.instance.connections[0];
        const projects = await conn.getProjects();
        expect(projects).to.not.be.empty;
        console.log(`${conn.toString()} has ${projects.length} project(s):`, projects);

        const mpProjects = projects.filter( (p) => p.type.type === ProjectType.Types.MICROPROFILE && p.state.isEnabled);
        console.log("Enabled Microprofile projects:", mpProjects);
        expect(mpProjects, "No Enabled Microprofile projects were found").to.not.be.empty;

        const mpProject: Project = mpProjects[0];
        console.log(`Waiting for ${mpProject.name} to be Started`);
        const restartTimeout = 120000;
        await mpProject.waitForState(restartTimeout, ProjectState.AppStates.STARTED);
        expect(mpProject.state.appState).to.equal(ProjectState.AppStates.STARTED);

        console.log(`Restarting project ${mpProject.name} into Run mode`);
        await vscode.commands.executeCommand(Commands.RESTART_RUN, mpProject);

        console.log("Issued restart request");

        await SocketTestUtil.expectSocketEvent(SocketTestUtil.getAppStateEvent(ProjectState.AppStates.STOPPED));
        await SocketTestUtil.expectSocketEvent(SocketTestUtil.getAppStateEvent(ProjectState.AppStates.STARTED));

        // await mpProject.waitForState(restartTimeout, ProjectState.AppStates.DEBUGGING);
        console.log("Finished waiting for debugging mode");

        expect(mpProject.state.appState).to.equal(ProjectState.AppStates.STARTED);

        const debugSession = vscode.debug.activeDebugSession;
        if (debugSession == null) {
            throw expect.fail(undefined, undefined, "There should be an active debug session");
        }
        expect(debugSession.name).to.contain(mpProject.name);
    });

});


