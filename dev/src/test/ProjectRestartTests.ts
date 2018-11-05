import { expect } from "chai";
import * as vscode from "vscode";

import Logger from "../Logger";
import Commands from "../constants/Commands";
import ProjectType from "../microclimate/project/ProjectType";
import Project from "../microclimate/project/Project";
import ProjectState from "../microclimate/project/ProjectState";

import * as SocketTestUtil from "./SocketTestUtil";

import { longTimeout, getProjectOfType } from "./extension.test";

 // tslint:disable:typedef no-unused-expression no-invalid-this ban

export default function doRestartTests(projectType: ProjectType.Types, hasDebugCapability: Boolean): void {

    let project: Project;

    it(`should restart a ${projectType} project in Run mode`, async function() {
        this.timeout(longTimeout);

        project = await getProjectOfType(projectType);
        Logger.test(`Using Microprofile project ${project.name}. Waiting for it to be Started`);
        await project.waitForStarted(longTimeout);
        expect(project.state.appState).to.be.oneOf(ProjectState.getStartedStates());

        await testRestart(project, false);
    });

    it(`should restart a ${projectType} project in Debug mode`, async function() {
        if (!hasDebugCapability) {
            Logger.test("Can't debug this project type - should assert that request is rejected by Microclimate");
            return;
        }

        this.timeout(longTimeout);

        project = project || await getProjectOfType(projectType);
        Logger.test(`Using ${projectType} project ${project.name}. Waiting for it to be Started`);
        await project.waitForStarted(longTimeout);
        expect(project.state.appState).to.be.oneOf(ProjectState.getStartedStates());

        await testRestart(project, true, hasDebugCapability);
        Logger.test("Testing active debug session");

        const debugSession = vscode.debug.activeDebugSession;
        if (debugSession == null) {
            throw expect.fail(undefined, undefined, "There should be an active debug session");
        }
        Logger.test("Active debug session is named " + debugSession.name);
        expect(debugSession.name).to.contain(project.name, "Active debug session is not for this project");
    });
}

async function testRestart(project: Project, debug: Boolean, shouldSucceed: Boolean = true) {
    Logger.test(`Testing restart debug=${debug} on project ${project.name}`);
    const restartCmdResult: any = await vscode.commands.executeCommand(debug ? Commands.RESTART_DEBUG : Commands.RESTART_RUN, project);
    expect(restartCmdResult).to.exist;
    Logger.test("Restart response is ", restartCmdResult);

    const statusCode: number = restartCmdResult.statusCode;
    expect(statusCode, "Restart result didn't have a statusCode, so it probably isn't a requestResult").to.exist;
    Logger.test("Status code from restart result is " + statusCode);

    if (shouldSucceed) {
        expect(statusCode, `Received unexpected statusCode ${statusCode} from restart request, expected success. Check restart response above`)
            .to.be.greaterThan(199).and.lessThan(400);
    }
    else {
        expect(statusCode, `Received unexpected statusCode ${statusCode} from restart request, expected client error. Check restart response above`)
            .to.be.greaterThan(399).and.lessThan(500);
        // The API blocks us from proceeding, as it should.
        return;
    }

    await SocketTestUtil.expectSocketEvent(SocketTestUtil.getAppStateEvent(ProjectState.AppStates.STOPPED));
    await SocketTestUtil.expectSocketEvent(SocketTestUtil.getAppStateEvent(ProjectState.AppStates.STARTING));
    // Note there is no 'debugging' appState for the socket events. Only look for Started.
    await SocketTestUtil.expectSocketEvent(SocketTestUtil.getAppStateEvent(ProjectState.AppStates.STARTED));

    Logger.test("Finished waiting for Started event");

    const terminalState = debug ? ProjectState.AppStates.DEBUGGING : ProjectState.AppStates.STARTED;

    // should resolve immediately
    await project.waitForStarted(longTimeout);
    expect(project.state.appState,
        `${project.name} should be ${terminalState}, is instead ${project.state.appState}`).to.equal(terminalState);

    Logger.test(`Done testing restart for ${project.name} into ${terminalState} mode`);
}
