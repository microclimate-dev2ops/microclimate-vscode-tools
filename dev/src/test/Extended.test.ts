/*
import { expect } from "chai";
import * as vscode from "vscode";

import * as base from "./Base.test";
import TestConfig from "./TestConfig";
import Commands from "../constants/Commands";
import ProjectObserver from "./ProjectObserver";
import ProjectState from "../microclimate/project/ProjectState";


describe(`Extended tests`, async function() {

    before("Check initialization", function() {
        expect(base.testConnection, "Test Connection is null").to.exist;
    });

    for (const testType of TestConfig.projectTypesToTest) {

        it("Should kick off a project build manually", async function() {
            await vscode.commands.executeCommand(Commands.REQUEST_BUILD, project);
        });

        it("Should disable and re-enable a project", async function() {
            await vscode.commands.executeCommand(Commands.DISABLE_PROJECT, project);
            await ProjectObserver.instance.awaitProjectState(ProjectState.AppStates.DISABLED);

            await vscode.commands.executeCommand(Commands.ENABLE_PROJECT, project);
            await ProjectObserver.instance.awaitProjectState(ProjectState.AppStates.STOPPED);
        });
    }
});*/
