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

// import this so that mocha will execute this file second
// Don't worry about it being unused.
import * as base from "./base.test";
base;

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
import Requester from "../microclimate/project/Requester";

interface ITestableProjectType {
    projectType: ProjectType;
    // We want to tests projects that can't be restarted too,
    // so tell the test whether or not the restart should succeed here.
    canRestart: boolean;
    projectID?: string;
    projectName?: string;
}

const projectTypesToTest: ITestableProjectType[] = [
    {
        projectType: new ProjectType(ProjectType.InternalTypes.NODE, ProjectType.Languages.NODE),
        canRestart: true
    },
    {
        projectType: new ProjectType(ProjectType.InternalTypes.SPRING, ProjectType.Languages.JAVA),
        canRestart: true
    },
    {
        projectType: new ProjectType(ProjectType.InternalTypes.MICROPROFILE, ProjectType.Languages.JAVA),
        canRestart: true
    },
    {
        projectType: new ProjectType(ProjectType.InternalTypes.DOCKER, ProjectType.Languages.PYTHON),
        canRestart: false
    },
    // {
    //     projectType: new ProjectType(ProjectType.InternalTypes.SWIFT, ProjectType.Languages.SWIFT),
    //     canRestart: false
    // },
    // {
    //     projectType: new ProjectType(ProjectType.InternalTypes.DOCKER, ProjectType.Languages.GO),
    //     canRestart: false
    // }
];

describe(`Restart tests`, async function() {
    let connection: Connection;

    before("Create test projects", async function() {
        // Long timeout because project creation is slow
        this.timeout(TestUtil.getMinutes(10));

        connection = ConnectionManager.instance.connections[0];
        expect(connection, "No Microclimate connection").to.exist;

        const createPromises: Array<Promise<Project | undefined>> = [];
        projectTypesToTest.forEach( (_, i) => {
            const testType = projectTypesToTest[i];
            Log.t("Create project of type: " + JSON.stringify(testType.projectType));

            const createPromise = TestUtil.createProject(connection, testType.projectType);
            createPromises.push(createPromise);

            createPromise
                .then( (p) => {
                    if (p != null) {
                        testType.projectID = p.id;
                        testType.projectName = p.name;
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

        Log.t("Done creating test projects", projectTypesToTest);
    });

    for (const testType of projectTypesToTest) {
        let projectID: string;
        let projectName: string;
        const canRestart: boolean = testType.canRestart;

        it(`${testType.projectType} - should be able to acquire the test project we created, and wait for it to be Started`, async function() {
            Log.t(`Acquiring project of type ${testType.projectType}`);
            projectID = testType.projectID!;
            projectName = testType.projectName!;
            Log.t(`Project name is ${projectName} and projectID is ${projectID}`);

            expect(projectID).to.exist;
            expect(projectName).to.exist;
            // Extra long timeout because it can take a long time for project to start the first time as the image builds
            this.timeout(TestUtil.getMinutes(10));

            await ProjectObserver.instance.awaitProjectStarted(projectID);
            await TestUtil.assertProjectInState(connection, projectID, ...ProjectState.getStartedStates());
            Log.t(`Acquisition of project ${projectName} succeeded`);
        });

        it(`${testType.projectType} - should ${canRestart ? "" : "NOT "}be able to restart the project in Run mode`, async function() {
            expect(projectID, "Failed to get test project").to.exist;
            Log.t(`Using ${testType.projectType} project ${projectName}`);
            await TestUtil.assertProjectInState(connection, projectID, ...ProjectState.getStartedStates());

            this.timeout(TestUtil.getMinutes(5));

            const success = await testRestart(await TestUtil.getProjectById(connection, projectID), false, canRestart);
            const failMsg = canRestart ? "Restart unexpectedly failed" : "Restart succeeded, but should have failed!";
            Log.t(`Restart into run mode ${success ? "succeeded" : "failed"}`);
            expect(success, failMsg).to.equal(canRestart);
            Log.t(`${testType.projectType} - restart into Run mode test passed`);
        });

        afterEach("Kill active debug session", TestUtil.killActiveDebugSession);

        // There's no point in running the next test if this one fails, so track that with this variable.
        let debugReady = false;
        const debugDelay = 10000;

        it(`${testType.projectType} - should ${canRestart ? "" : "NOT "}be able to restart the project in Debug mode`, async function() {
            expect(projectID, "Failed to get test project").to.exist;
            await TestUtil.assertProjectInState(connection, projectID, ...ProjectState.getStartedStates());
            this.timeout(TestUtil.getMinutes(5));

            Log.t(`Using ${testType.projectType} project ${projectName}`);

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
            await TestUtil.wait(debugDelay, "Giving debugger connect a chance to complete");
            await assertDebugSessionExists(projectName);
            Log.t("Debugger connect succeeded");

            // Now wait for it to enter Debugging state (much slower for Liberty)
            await ProjectObserver.instance.awaitProjectState(projectID, ProjectState.AppStates.DEBUGGING);
            debugReady = true;
            Log.t("Debug restart test passed");
        });

        if (canRestart) {
            it(`${testType.projectType} - should be able to attach the debugger to the same Debugging project`, async function() {
                expect(projectID, "Failed to get test project").to.exist;
                expect(debugReady, "Restart into debug mode failed, so we can't attach the debugger.").to.be.true;

                this.timeout(TestUtil.getMinutes(2));

                // It should have reached Debugging state in the previous test, so this should be fast
                await ProjectObserver.instance.awaitProjectState(projectID, ProjectState.AppStates.DEBUGGING);

                const project = await TestUtil.getProjectById(connection, projectID);
                await vscode.commands.executeCommand(Commands.ATTACH_DEBUGGER, project);
                await TestUtil.wait(debugDelay, "Giving debugger connect a chance to complete again");
                await assertDebugSessionExists(projectName);

                Log.t("Debugger connect succeeded again");
            });
        }

        it(`should clean up the test project`, async function() {
            if (projectID != null) {
                try {
                    const project = await TestUtil.getProjectById(connection, projectID);
                    await Requester.requestDelete(project);
                    ProjectObserver.instance.onDelete(projectID);
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

export async function testRestart(project: Project, debug: boolean, shouldSucceed: boolean): Promise<boolean> {
    Log.t(`Testing restart debug=${debug} on project ${project.name}. should be restartable? ${shouldSucceed}`);

    const restartCmdResult: any = await vscode.commands.executeCommand(debug ? Commands.RESTART_DEBUG : Commands.RESTART_RUN, project);
    expect(restartCmdResult, "Restart command returned null").to.exist;
    // the result here is the request response
    Log.t("Restart response is", restartCmdResult);
    expect(restartCmdResult, "Restart did not fail or succeed as expected").to.equal(shouldSucceed);

    if (!restartCmdResult) {
        // If the restart failed, the test is over, whether or not we expected it to fail.
        return false;
    }

    Log.t("Restart result matched expected; waiting now for Restart Result event");

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
    expect(debugSession, `${projectName} There should be an active debug session`).to.exist;
    Log.t(`Active debug session is named "${debugSession!.name}"`);
    expect(debugSession!.name).to.contain(projectName, "Active debug session is not for this project");
    const threads = await debugSession!.customRequest("threads");
    Log.t("Debugger threads", threads);
    // only 1 thread for node projects
    expect(threads["threads"], "Debug session existed but has no threads").to.exist.and.not.be.empty;
}
