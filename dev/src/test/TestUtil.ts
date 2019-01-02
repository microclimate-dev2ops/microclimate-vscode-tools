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
import * as request from "request-promise-native";

import Log from "../Logger";
import ProjectType from "../microclimate/project/ProjectType";
import Project from "../microclimate/project/Project";
import Connection from "../microclimate/connection/Connection";
import Endpoints from "../constants/Endpoints";
import ProjectObserver from "./ProjectObserver";
import ProjectState from "../microclimate/project/ProjectState";

namespace TestUtil {

    export function getMinutes(mins: number): number {
        return mins * 60 * 1000;
    }

    const PROJECT_PREFIX = "test";

    export async function createProject(connection: Connection, type: ProjectType): Promise<Project> {
        // acquireProject below will only look for projects starting with the project prefix
        const projectName: string = PROJECT_PREFIX + type.type.toLowerCase().replace(".", "") + Date.now().toString().slice(-8);
        Log.t(`Create project of type ${type} at ${connection.mcUri} named ${projectName}`);

        const uri: string = connection.mcUri.with({ path: Endpoints.PROJECTS }).toString();

        const payload: any = {
            name: projectName,
            language: type.language
        };

        if (type.language === ProjectType.Languages.JAVA) {
            // framework is "microprofile" or "spring"
            payload["framework"] = type.type.toLowerCase();
            /*
            if (type.type === ProjectType.Types.MICROPROFILE) {
                payload["contextroot"] = projectName;
            }*/
        }
        // These strings must match the extension names in microclimate-workspace/.extensions
        else if (type.language === ProjectType.Languages.PYTHON) {
            payload["extension"] = "templateExample";
        }
        else if (type.language === ProjectType.Languages.GO) {
            payload["extension"] = "templateGoExample";
        }

        const options = {
            json: true,
            body: payload,
            resolveWithFullResponse: true
        };

        Log.t("Issuing create request:", payload);
        try {
            await request.post(uri, options);
        }
        catch (err) {
            Log.t("Create project failure!", err);
            throw err;
        }

        Log.t("Awaiting project creation");
        const projectID = await ProjectObserver.instance.awaitCreate(projectName);

        const createdProject: Project | undefined = await connection.getProjectByID(projectID);
        expect(createdProject, `Failed to get newly created project ${projectName}`).to.exist;
        if (createdProject == null) {
            throw new Error("CreatedProject can't be null after here");
        }

        expect(createdProject).to.exist;
        expect(createdProject.id).to.equal(projectID);
        expect(createdProject.name).to.equal(projectName);
        Log.t(`Created project ${createdProject.name} successfully with ID ${createdProject.id}`);

        return createdProject;
    }

    /**
     * Since Project objects will get stale, if you want the actual current state, use this.
     */
    export async function getProjectById(connection: Connection, projectID: string): Promise<Project> {
        const project = await connection.getProjectByID(projectID);
        if (project == null) {
            throw new Error(`Couldn't get project with ID ${projectID} on connection ${connection}`);
        }
        return project;
    }

    export async function assertProjectInState(connection: Connection, projectID: string, ...states: ProjectState.AppStates[]): Promise<void> {
        if (states.length === 0) {
            Log.e("No states passed to assertProjectInState");
        }
        const project = await getProjectById(connection, projectID);
        Log.t(`Assert project ${project.name} is one of ${JSON.stringify(states)}`);

        const failMsg = `assertProjectInState failure: ` +
            `Project ${project.name} is not in any of states: ${JSON.stringify(states)}, is instead ${project.state.appState}`;

        expect(states, failMsg).to.include(project.state.appState);

        Log.t(`Assert passed, state is ${project.state.appState}`);
    }

    export function expectSuccessStatus(statusCode: number, failMsg?: string): void {
        if (failMsg == null) {
            failMsg = "Expected statusCode between [200, 400) but received " + statusCode;
        }

        expect(statusCode, failMsg).to.be.greaterThan(199).and.lessThan(400);
    }

    export function expect400Status(statusCode: number, failMsg?: string): void {
        if (failMsg == null) {
            failMsg = "Expected statusCode between [400, 500) but received " + statusCode;
        }

        expect(statusCode, failMsg).to.be.greaterThan(399).and.lessThan(500);
    }

    /**
     * Await on this function to pause for the given duration.
     * Make sure you set the timeout in the calling test to be at least this long.
     */
    export async function wait(ms: number, reason?: string): Promise<void> {
        const msg: string = `Waiting ${ms}ms` + (reason != null ? ": " + reason : "");
        Log.t(msg);
        return new Promise<void> ( (resolve) => setTimeout(resolve, ms));
    }

    /**
     * Await on this to suspend the test. Useful for debugging tests through the VSCode test instance.
     *
     * **Be careful to not push code that calls this**, or you'll hang the tests!
     */
    export async function waitForever(testContext:
            Mocha.ITestCallbackContext  |
            Mocha.ISuiteCallbackContext |
            Mocha.IBeforeAndAfterContext
        ): Promise<void> {

        testContext.timeout(0);

        return new Promise<void> ( () => { /* never resolves */ } );
    }

    /*
    export async function killAllDebugSessions(): Promise<void> {
        let counter = 0;
        while (vscode.debug.activeDebugSession != null) {
            await killActiveDebugSession();
            counter++;
        }
        if (counter > 0) {
            Logger.test(`Killed ${counter} active debug sessions`);
        }
    }*/

    export function killActiveDebugSession(): Thenable<void> {
        const activeDbSession = vscode.debug.activeDebugSession;
        if (activeDbSession != null) {
            // Logger.test("Attempting to disconnect from active debug session " + activeDbSession.name);

            // These parameters are not documented, see the code linked below for Java. Seems to work for Node too.
            // tslint:disable-next-line:max-line-length
            // https://github.com/Microsoft/java-debug/blob/master/com.microsoft.java.debug.core/src/main/java/com/microsoft/java/debug/core/protocol/Requests.java#L169
            return activeDbSession.customRequest("disconnect", { terminateDebuggee: false, restart: false })
                .then(
                    ()      => Log.t(`Disconnected debug session "${activeDbSession.name}"`),
                    (err)   => Log.t(`Error disconnecting from debug session ${activeDbSession.name}:`, err)
                );
        }

        return Promise.resolve();
    }
}

export default TestUtil;
