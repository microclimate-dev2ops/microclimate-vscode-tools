import { expect } from "chai";
import * as vscode from "vscode";

import Logger from "../Logger";
import Commands from "../constants/Commands";
import ProjectType from "../microclimate/project/ProjectType";
import Project from "../microclimate/project/Project";
import ProjectState from "../microclimate/project/ProjectState";

import * as SocketTestUtil from "./SocketTestUtil";

import TestUtil from "./TestUtil";

 // tslint:disable:typedef no-unused-expression no-invalid-this ban

export default function doRestartTests(projectType: ProjectType.Types, canRestart: Boolean): void {

    let project: Project;

    let expectation;

    if (canRestart) {
        expectation = `should restart a ${projectType} project in Run mode`;
    }
    else {
        expectation = `should fail to restart a ${projectType} project in Run mode`;
    }

    it(expectation, async function() {
        this.timeout(TestUtil.longTimeout);

        project = await TestUtil.getProjectOfType(projectType);
        Logger.test(`Using ${project.type} project ${project.name}`);
        await TestUtil.waitForProjectStarted(project);

        const success = await testRestart(project, false, canRestart);
        const failMsg = canRestart ? "Restart unexpectedly failed" : "Restart succeeded, but should have failed!";
        expect(success, failMsg).to.be.equal(canRestart);
    });

    if (canRestart) {
        expectation = `should restart a ${projectType} project in Debug mode`;
    }
    else {
        expectation = `should fail to restart a ${projectType} project in Debug mode`;
    }

    it(expectation, async function() {
        this.timeout(TestUtil.longTimeout);

        project = project || await TestUtil.getProjectOfType(projectType);
        Logger.test(`Using ${project.type} project ${project.name}`);
        await TestUtil.waitForProjectStarted(project);

        const success = await testRestart(project, true, canRestart);

        const failMsg = canRestart ? "Restart unexpectedly failed" : "Restart succeeded, but should have failed!";
        expect(success, failMsg).to.be.equal(canRestart);
        if (!success) {
            // if we expected it to fail, the test is over here.
            return;
        }

        Logger.test("Restart into debug mode succeeded.");

        // Wait 5 seconds, this helps resolve some timing issues with debugger connection.
        await TestUtil.wait(5000, "Giving debugger connect a chance to complete");

        const debugSession = vscode.debug.activeDebugSession;

        if (debugSession == null) {
            // throw an error (rather than expect) so the compiler can see that debugSession != null after this
            Logger.test("No active debug session");
            throw new Error("There should be an active debug session");
        }
        Logger.test("Active debug session is named " + debugSession.name);
        expect(debugSession.name).to.contain(project.name, "Active debug session is not for this project");
        const threads = await debugSession.customRequest("threads");
        Logger.test("Debugger threads", threads);
        // it will only have length 1 for node projects
        expect(threads["threads"], "Debug session existed but has no threads").to.exist.and.not.be.empty;
    });
}

async function testRestart(project: Project, debug: Boolean, shouldSucceed: Boolean): Promise<Boolean> {
    Logger.test(`Testing restart debug=${debug} on project ${project.name}. should be restartable? ${shouldSucceed}`);
    const restartCmdResult: any = await vscode.commands.executeCommand(debug ? Commands.RESTART_DEBUG : Commands.RESTART_RUN, project);
    expect(restartCmdResult).to.exist;
    Logger.test("Restart response is ", restartCmdResult);

    const statusCode: number = restartCmdResult.statusCode;
    expect(statusCode, "Restart result didn't have a statusCode, so it probably isn't a requestResult").to.exist;
    Logger.test("Status code from restart result is " + statusCode);

    if (shouldSucceed) {
        TestUtil.expectSuccessStatus(statusCode);
    }
    else {
        TestUtil.expect400Status(statusCode);
        // The API blocks us from proceeding, as it should.
        return false;
    }

    await SocketTestUtil.expectSocketEvent(SocketTestUtil.getAppStateEvent(ProjectState.AppStates.STOPPED));
    await SocketTestUtil.expectSocketEvent(SocketTestUtil.getAppStateEvent(ProjectState.AppStates.STARTING));
    // Note there is no 'debugging' appState for the socket events. Only look for Started.
    await SocketTestUtil.expectSocketEvent(SocketTestUtil.getAppStateEvent(ProjectState.AppStates.STARTED));

    Logger.test("Finished waiting for Started event");

    const terminalState = debug ? ProjectState.AppStates.DEBUGGING : ProjectState.AppStates.STARTED;

    // should resolve immediately
    await project.waitForStarted(TestUtil.longTimeout);
    expect(project.state.appState,
        `${project.name} should be ${terminalState}, is instead ${project.state.appState}`).to.equal(terminalState);

    Logger.test(`Done testing restart for ${project.name} into ${terminalState} mode`);
    return true;
}