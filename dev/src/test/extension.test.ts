import { expect } from "chai";
import * as vscode from "vscode";
import * as fs from "fs";

import Logger from "../Logger";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import Commands from "../constants/Commands";

import * as SocketTestUtil from "./SocketTestUtil";
import ProjectType from "../microclimate/project/ProjectType";

import doRestartTests from "./ProjectRestartTests";
import Project from "../microclimate/project/Project";

// tslint:disable:typedef no-unused-expression no-invalid-this ban

const workspace = "/Users/tim/programs/microclimate/microclimate-workspace";
const extensionName = "IBM.vscode-microclimate-tools";

const projectTypesToTest: ProjectType.Types[] = [
    ProjectType.Types.MICROPROFILE,
    ProjectType.Types.SPRING,
    ProjectType.Types.NODE
];

export const longTimeout: number = 120000;

// Defines a Mocha test suite to group tests of similar kind together
describe("Microclimate Tools for VSCode Microprofile test", async function() {

    // The test needs to be launched with the microclimate-workspace open, so that the extension is activated.

    before("should have opened the workspace, and have loaded the extension", async function() {
        const wsFolders = vscode.workspace.workspaceFolders;
        Logger.test("Workspace folders:", wsFolders);
        expect(wsFolders).to.have.length.greaterThan(0);
        if (wsFolders == null) {
            throw new Error("WSFolders can't be null after here.");
        }
        expect(wsFolders[0].uri.fsPath).to.equal(workspace);

        Logger.test("Loaded extensions:", vscode.extensions.all.map( (extension) => extension.id));
        const extension = await vscode.extensions.getExtension(extensionName);
        expect(extension).to.exist;

        Logger.test("Workspace is good and extension is loaded.");
        Logger.silenceLevels(Logger.Levels.INFO);
    });

    it("should have a log file file that is readable and non-empty", async function() {
        const logPath = Logger.getLogFilePath;

        expect(logPath).to.exist;
        Logger.test("The logs are at " + logPath);

        fs.readFile(logPath, (err: NodeJS.ErrnoException, data) => {
            expect(err, "Couldn't read log file, error was " + err).to.be.null;
            const logContents = data.toString("utf8");
            expect(logContents).to.have.length.greaterThan(0, "Log existed but was empty!");
        });
    });

    it("should initially have no connections", async function() {
        const connMan = ConnectionManager.instance;
        expect(connMan).to.exist;

        const noConnections = connMan.connections.length;
        if (noConnections > 0) {
            Logger.test("Clearing " + noConnections + " previous connection(s)");

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
        Logger.test("Finished default connection command");

        expect(connMan.connections.length).to.eq(1, "Failed to create new connection");

        const connection = connMan.connections[0];
        // expect(connection.isConnected).to.be.true;
        expect(connection.host).to.equal("localhost");
        expect(connection.mcUri.authority).to.contain("localhost:9090");
    });

    it("should have a socket connection", async function() {
        const uri = ConnectionManager.instance.connections[0].mcUri.toString();

        const testSocket = await SocketTestUtil.createTestSocket(uri);
        expect(testSocket.connected, "Socket did not connect").to.be.true;
    });

    for (const projectType of projectTypesToTest) {
        describe(`Restart tests for ${projectType}`, async function() {
            doRestartTests(projectType, true);
        });
    }
});

export async function getProjectOfType(projectType: ProjectType.Types): Promise<Project> {
    Logger.test("Acquiring project of type " + projectType);
    const conn = ConnectionManager.instance.connections[0];
    const projects = await conn.getProjects();
    expect(projects).to.not.be.empty;
    Logger.test(`${conn.toString()} has ${projects.length} project(s):`, projects);

    const projectsOfType = projects.filter( (p) => p.type.type === projectType && p.state.isEnabled);
    Logger.test(`Enabled ${projectType} projects:`, projectsOfType);
    expect(projectsOfType, `No Enabled ${projectType} projects were found`).to.not.be.empty;

    const result = projectsOfType[0];
    expect(result).to.exist;

    return projectsOfType[0];
}
