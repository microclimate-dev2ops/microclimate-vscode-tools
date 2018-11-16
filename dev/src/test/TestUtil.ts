import { expect } from "chai";
import * as vscode from "vscode";
import * as request from "request-promise-native";

import Log from "../Logger";
import ProjectType from "../microclimate/project/ProjectType";
import Project from "../microclimate/project/Project";
import Connection from "../microclimate/connection/Connection";
import Endpoints from "../constants/Endpoints";
import ProjectObserver from "./ProjectObserver";

// tslint:disable:ban no-unused-expression

namespace TestUtil {

    export const LONG_TIMEOUT = 2 * 60 * 1000;
    const PROJECT_PREFIX = "test";

    export async function createTestProjects(connection: Connection, projectTypes: ProjectType[]): Promise<(Project | undefined)[]> {
        const result: Promise<Project | undefined>[] = [];
        for (const projectType of projectTypes) {
            result.push(TestUtil.createProject(connection, projectType));
        }
        return Promise.all(result);
    }

    export async function createProject(connection: Connection, type: ProjectType): Promise<Project> {
        // acquireProject below will only look for projects starting with "test"
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
            if (type.type === ProjectType.Types.MICROPROFILE) {
                payload["contextroot"] = projectName;
            }
        }
        // I don't know where these strings come from.
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
        catch(err) {
            Log.t("Create project failure!", err);
        }

        Log.t("Awaiting project creation");
        const projectID = await ProjectObserver.instance.awaitCreate(projectName);

        //expect(creationResult).to.exist;

        //const projectID = creationResult.projectID;

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

    export async function deleteProject(connection: Connection, projectID: string): Promise<void> {
        const uri: string = connection.mcUri.with({ path: `${Endpoints.PROJECTS}/${projectID}` }).toString();
        Log.t("Deleting " + projectID);

        request.delete(uri)
            .catch( (err) => Log.t(`Error deleting project ${projectID}:`, err));
    }

    export async function getTestProject(connection: Connection, projectType: ProjectType.Types): Promise<Project | undefined> {
        Log.t("Acquiring project of type " + projectType);

        const projects = await connection.getProjects();
        Log.t(`${connection.toString()} has ${projects.length} project(s):`, projects);

        const projectsOfType = projects.filter(
            (p) => p.type.type === projectType && p.state.isEnabled && p.name.startsWith(PROJECT_PREFIX)
        );

        Log.t(`Enabled ${projectType} projects:`, projectsOfType);
        if (projectsOfType.length === 0) {
            Log.t("No matching projects! All the projects:", projects);
            return undefined;
        }
        else if (projectsOfType.length !== 1) {
            Log.e("TESTUTIL: Too many matching projects! We might test the wrong project!");
        }

        return projectsOfType[0];
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

        // this will never resolve :(
        return new Promise<void> ( () => {} );
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
            return activeDbSession.customRequest("disconnect", { "terminateDebuggee": false, "restart": false })
                .then(
                    ()      => Log.t(`Disconnected debug session "${activeDbSession.name}"`),
                    (err)   => Log.t(`Error disconnecting from debug session ${activeDbSession.name}:`, err)
                );
        }

        return Promise.resolve();
    }
}

export default TestUtil;