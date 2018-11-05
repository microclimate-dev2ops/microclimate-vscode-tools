import { expect } from "chai";

import Logger from "../Logger";
import { ProjectType } from "../microclimate/project/ProjectType";
import Project from "../microclimate/project/Project";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import ProjectState from "../microclimate/project/ProjectState";
import * as SocketTestUtil from "./SocketTestUtil";

// tslint:disable:ban no-unused-expression

namespace TestUtil {

    export const longTimeout = 120000;

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

        return result;
    }

    /**
     * Wait for the given project to be Started. Will just use regular mocha timeout.
     * Assets that the project is started before returning.
     *
     * This is preferred over using project.waitForState
     * because we don't want to override/cancel the existing state being awaited in the product code.
     */
    export async function waitForProjectStarted(project: Project): Promise<void> {
        if (!project.state.isStarted) {
            Logger.test(`Waiting for ${project.name} to be Started, is currently ${project.state}`);
            await SocketTestUtil.expectSocketEvent(SocketTestUtil.getAppStateEvent(ProjectState.AppStates.STARTED));
        }
        else {
            Logger.test(`No need to wait, ${project.name} is already Started`);
        }
        expect(project.state.isStarted, "Project did not start").to.be.true;
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
        const msg: string = `Waiting ${ms}ms` + (reason ? ": " + reason : "");
        Logger.test(msg);
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

        // this will never resolve :(
        return new Promise<void> ( () => {});
    }
}

export default TestUtil;