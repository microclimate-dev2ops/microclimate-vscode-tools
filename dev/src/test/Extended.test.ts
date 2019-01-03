import { expect } from "chai";
import * as vscode from "vscode";

import * as Base from "./Base.test";

import TestConfig from "./TestConfig";
import Commands from "../constants/Commands";
import ProjectObserver from "./ProjectObserver";
import ProjectState from "../microclimate/project/ProjectState";
import Log from "../Logger";
import TestUtil from "./TestUtil";
import Project from "../microclimate/project/Project";
import SocketTestUtil from "./SocketTestUtil";
import SocketEvents from "../microclimate/connection/SocketEvents";

describe(`Extended tests`, async function() {

    before("Check initialization", function() {
        expect(Base.initializeSucceeded, "Initialize failed in base test").to.be.true;
        expect(Base.testConnection, "Test Connection is null").to.exist;
    });

    for (const testType of TestConfig.projectTypesToTest) {
        let project: Project;

        it(`${testType.projectType} - should be able to acquire the test project we created, and wait for it to be Started`, async function() {
            Log.t(`Acquiring project of type ${testType.projectType}`);
            project = await TestUtil.getProjectById(Base.testConnection, testType.projectID!);
            expect(project, "Failed to get test project").to.exist;

            // Extra long timeout because it can take a long time for project to start the first time as the image builds
            this.timeout(TestUtil.getMinutes(10));

            await ProjectObserver.instance.awaitProjectStarted(project.id);
            await TestUtil.assertProjectInState(Base.testConnection, project.id, ...ProjectState.getStartedStates());
            Log.t(`Acquisition of project ${project.name} succeeded`);
        });

        it(`${testType.projectType} - should kick off a project build manually`, async function() {
            expect(project, "Failed to get test project").to.exist;
            this.timeout(TestUtil.getMinutes(5));

            Log.t("Requesting a build for " + project.name);
            await vscode.commands.executeCommand(Commands.REQUEST_BUILD, project);

            await SocketTestUtil.expectSocketEvent({
                eventType: SocketEvents.Types.PROJECT_STATUS_CHANGED,
                projectID: project.id,
                expectedData: { key: SocketEvents.Keys.BUILD_STATE, value: "inProgress" }
            });

            Log.t(project.name + " is building");
            await SocketTestUtil.expectSocketEvent({
                eventType: SocketEvents.Types.PROJECT_STATUS_CHANGED,
                projectID: project.id,
                expectedData: { key: SocketEvents.Keys.BUILD_STATE, value: "success" }
            });

            await ProjectObserver.instance.awaitProjectStarted(project.id);
            Log.t(project.name + " restarted after a build request");
        });

        it(`${testType.projectType} - should disable and re-enable a project`, async function() {
            expect(project, "Failed to get test project").to.exist;
            this.timeout(TestUtil.getMinutes(5));

            Log.t("Disabling " + project.name);
            await vscode.commands.executeCommand(Commands.DISABLE_PROJECT, project);
            await ProjectObserver.instance.awaitAppState(project.id, ProjectState.AppStates.DISABLED);

            Log.t("Enabling " + project.name);
            await vscode.commands.executeCommand(Commands.ENABLE_PROJECT, project);
            await ProjectObserver.instance.awaitAppState(project.id, ...ProjectState.getEnabledStates());
        });
    }
});
