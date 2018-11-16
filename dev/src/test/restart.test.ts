import { expect } from "chai";
import * as assert from "assert";
import * as vscode from "vscode";

// import this so that mocha will execute this file second
// Don't worry about it being unused.
import * as base from "./base.test";

import Project from "../microclimate/project/Project";
import Log from "../Logger";
import ProjectState from "../microclimate/project/ProjectState";
import Commands from "../constants/Commands";
import ProjectType from "../microclimate/project/ProjectType";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import Connection from "../microclimate/connection/Connection";

import TestUtil from "./TestUtil";
import ProjectObserver from "./ProjectObserver";
import SocketTestUtil from "./SocketTestUtil";
import EventTypes from "../microclimate/connection/EventTypes";

interface TestableProjectType {
    projectType: ProjectType;
    // We want to tests projects that can't be restarted too,
    // so tell the test whether or not the restart should succeed here.
    canRestart: Boolean;
}

// boolean indicates whether or not this project is restartable.
const projectTypesToTest: TestableProjectType[] = [
    {
        projectType: new ProjectType(ProjectType.InternalTypes.MICROPROFILE, ProjectType.Languages.JAVA),
        canRestart: true
    },
    {
        projectType: new ProjectType(ProjectType.InternalTypes.SPRING, ProjectType.Languages.JAVA),
        canRestart: true
    },
    // {
    //     projectType: new ProjectType(ProjectType.InternalTypes.NODE, ProjectType.Languages.NODE),
    //     canRestart: true
    // },
    // {
    //     projectType: new ProjectType(ProjectType.InternalTypes.SWIFT, ProjectType.Languages.SWIFT),
    //     canRestart: false
    // },
    {
        projectType: new ProjectType(ProjectType.InternalTypes.DOCKER, ProjectType.Languages.PYTHON),
        canRestart: false
    },
    {
        projectType: new ProjectType(ProjectType.InternalTypes.DOCKER, ProjectType.Languages.GO),
        canRestart: false
    }
];

describe(`Restart tests`, async function() {
    let connection: Connection;

    before("Create test projects", async function() {
        // Long timeout because project creation is slow
        this.timeout(60 * 10 * 1000);

        connection = ConnectionManager.instance.connections[0];
        expect(connection, "No Microclimate connection").to.exist;

        const projectTypes: ProjectType[] = projectTypesToTest.map( (type) => type.projectType);
        Log.t("Create projects of types: " + JSON.stringify(projectTypes.map( (t) => t.type)));

        // const createResult = await TestUtil.createTestProjects(connection, projectTypes);
        await TestUtil.createTestProjects(connection, projectTypes);
        Log.t("Done creating test projects");
    });

    for (const testType of projectTypesToTest) {
        let projectID: string;
        let projectName: string;
        const canRestart = testType.canRestart;

        it(`should be able to acquire the ${testType.projectType} test project we created, and wait for it to be Started`, async function() {
            // Extra long timeout because it can take a long time for project to start the first time
            this.timeout(60 * 5 * 1000);

            const project: Project | undefined = await TestUtil.getTestProject(connection, testType.projectType.type);
            const failMsg = "Failed to get test project";
            expect(project, failMsg).to.exist;
            if (project == null) {
                throw new Error(failMsg);
            }
            expect(project.type.type, "Got wrong test project").to.equal(testType.projectType.type);
            projectID = project.id;
            projectName = project.name;
            expect(projectID).to.exist;
            expect(projectName).to.exist;

            await ProjectObserver.instance.awaitProjectStarted(projectID);

            const state = (await TestUtil.getProjectById(connection, projectID)).state;
            expect(state.isStarted, `Project ${projectID} did not start, state is ${state}`).to.be.true;
        });

        it(`should ${canRestart ? "" : "NOT "}be able to restart the ${testType.projectType} project in Run mode`, async function() {
            expect(projectID, "Failed to get test project").to.exist;
            this.timeout(TestUtil.LONG_TIMEOUT);

            Log.t(`Using ${testType.projectType} project ${projectName}`);
            await ProjectObserver.instance.awaitProjectStarted(projectID);

            const success = await testRestart(await TestUtil.getProjectById(connection, projectID), false, canRestart);
            const failMsg = canRestart ? "Restart unexpectedly failed" : "Restart succeeded, but should have failed!";
            Log.t(`Restart into run mode ${success ? "succeeded" : "failed"}`);
            expect(success, failMsg).to.equal(canRestart);
        });

        afterEach("Kill active debug session", TestUtil.killActiveDebugSession);

        // There's no point in running the next test if this one fails, so track that with this variable.
        let debugReady = false;

        it(`should ${canRestart ? "" : "NOT "}be able to restart the ${testType.projectType} project in Debug mode`, async function() {
            expect(projectID, "Failed to get test project").to.exist;
            this.timeout(TestUtil.LONG_TIMEOUT);

            Log.t(`Using ${testType.projectType} project ${projectName}`);
            await ProjectObserver.instance.awaitProjectStarted(projectID);

            const success = await testRestart(await TestUtil.getProjectById(connection, projectID), true, canRestart);

            const failMsg = canRestart ? "Restart unexpectedly failed" : "Restart succeeded, but should have failed!";
            expect(success, failMsg).to.equal(canRestart);
            if (!success) {
                Log.t("Restart into debug mode failed");
                // if we expected it to fail, the test is over here.
                return;
            }

            Log.t("Restart into debug mode succeeded.");

            // Wait 5 seconds, this helps resolve some timing issues with debugger connection.
            await TestUtil.wait(5000, "Giving debugger connect a chance to complete");
            await assertDebugSessionExists(projectName);
            debugReady = true;
        });

        if (canRestart) {
            it(`should be able to attach the debugger to the same Debugging ${testType.projectType} project`, async function() {
                expect(projectID, "Failed to get test project").to.exist;
                expect(debugReady, "Restart into debug mode failed, so we can't attach the debugger.").to.be.true;

                this.timeout(TestUtil.LONG_TIMEOUT / 2);

                await ProjectObserver.instance.awaitProjectStarted(projectID);
                const project = await TestUtil.getProjectById(connection, projectID);
                expect(project.state.appState, `Project is not Debugging, is instead ${project.state}`).to.equal(ProjectState.AppStates.DEBUGGING);

                await vscode.commands.executeCommand(Commands.ATTACH_DEBUGGER, project);
                await TestUtil.wait(5000, "Giving debugger connect a chance to complete again");
                await assertDebugSessionExists(projectName);
            });
        }

        it(`should clean up the test project`, async function() {
            if (projectID != null) {
                try {
                    TestUtil.deleteProject(connection, projectID);
                }
                catch (err) {
                    Log.t(`Error deleting project ${projectName}:`, err);
                }
            }
            else {
                Log.t("Project creation failed; nothing to clean up");
            }
            // don't bother asserting deletion; it won't affect our results.
        });
    }
});

export async function testRestart(project: Project, debug: Boolean, shouldSucceed: Boolean): Promise<Boolean> {
    Log.t(`Testing restart debug=${debug} on project ${project.name}. should be restartable? ${shouldSucceed}`);

    const restartCmdResult: any = await vscode.commands.executeCommand(debug ? Commands.RESTART_DEBUG : Commands.RESTART_RUN, project);
    expect(restartCmdResult, "Restart command returned null").to.exist;
    // the result here is the request response
    Log.t("Restart response is ", restartCmdResult);

    const statusCode: number = restartCmdResult.statusCode;
    expect(statusCode, "Restart result didn't have a statusCode, so it probably isn't a requestResult").to.exist;
    Log.t("Status code from restart result is " + statusCode);

    if (shouldSucceed) {
        TestUtil.expectSuccessStatus(statusCode, restartCmdResult);
    }
    else {
        TestUtil.expect400Status(statusCode);
        // The API blocks us from proceeding, as it should.
        return false;
    }

    Log.t("Restart status code matched expected, waiting now for Restart Result event");

    const socketData = await SocketTestUtil.expectSocketEvent({
        eventType: EventTypes.PROJECT_RESTART_RESULT,
        projectID: project.id
    });

    expect(socketData["status"], "Microclimate failed to restart project!").to.equal("success");

    Log.t("Received good Restart Result event, waiting now for project restart state changes");

    // There _might_ be a timing issue here if the project exits the Starting state really quickly.
    const startingState = debug ? ProjectState.AppStates.DEBUG_STARTING : ProjectState.AppStates.STARTING;
    await ProjectObserver.instance.awaitProjectState(project.id, startingState);

    const terminalState = debug ? ProjectState.AppStates.DEBUGGING : ProjectState.AppStates.STARTED;
    await ProjectObserver.instance.awaitProjectState(project.id, terminalState);
    Log.t("Project restart was successful");

    const state = (await TestUtil.getProjectById(project.connection, project.id)).state;
    expect(state.appState, `Project restart appeared to succeed, but project is not ${terminalState}, is instead ${state}`).to.equal(terminalState);

    Log.t(`Done testing restart for ${project.name} into ${terminalState} mode`);
    return true;
}

export async function assertDebugSessionExists(projectName: string): Promise<void> {
    Log.t("assertDebugSessionExists containing name " + projectName);
    const debugSession = vscode.debug.activeDebugSession;

    if (debugSession == null) {
        // throw an error (rather than expect) so the compiler can see that debugSession != null after this
        Log.t("No active debug session");
        throw new Error("There should be an active debug session");
    }
    Log.t(`Active debug session is named "${debugSession.name}"`);
    expect(debugSession.name).to.contain(projectName, "Active debug session is not for this project");
    const threads = await debugSession.customRequest("threads");
    Log.t("Debugger threads", threads);
    // it will only have length 1 for node projects
    expect(threads["threads"], "Debug session existed but has no threads").to.exist.and.not.be.empty;
}