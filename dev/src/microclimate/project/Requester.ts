import * as vscode from "vscode";
import * as request from "request-promise-native";

import Project from "./Project";
import StartModes from "../../constants/StartModes";
import Endpoints from "../../constants/Endpoints";
import Log from "../../Logger";

namespace Requester {

    export async function requestProjectRestart(project: Project, startMode: StartModes): Promise<request.RequestPromise<any>> {
        const body = {
            startMode: startMode.toString()
        };

        const url = Endpoints.getProjectEndpoint(project.connection, project.id, Endpoints.RESTART_ACTION);
        return doProjectRequest(project, url, body, request.post, `Restart into ${body.startMode} mode`);
    }

    export async function requestBuild(project: Project): Promise<void> {
        const body = {
            action: "build"
        };

        const url = Endpoints.getProjectEndpoint(project.connection, project.id, Endpoints.BUILD_ACTION);
        // return doProjectRequest(project, url, body, request.post, "Build");
        return doProjectRequest(project, url, body, request.post, "Build")
            // This is a workaround for the Build action not refreshing validation state.
            // Will be fixed by https://github.ibm.com/dev-ex/iterative-dev/issues/530
            .then( (_: any) => requestValidate(project));
    }

    export async function requestToggleAutoBuild(project: Project): Promise<void> {
        const newAutoBuild: boolean = !project.autoBuildEnabled;
        // user-friendly action
        const newAutoBuildUserStr:  string = newAutoBuild ? "Enable auto build" : "Disable auto build";
        // action we'll put into the request body   https://github.ibm.com/dev-ex/portal/wiki/API:-Build
        const newAutoBuildAction:   string = newAutoBuild ? "enableautobuild" : "disableautobuild";

        const body = {
            action: newAutoBuildAction
        };

        const url = Endpoints.getProjectEndpoint(project.connection, project.id, Endpoints.BUILD_ACTION);
        return doProjectRequest(project, url, body, request.post, newAutoBuildUserStr)
            .then( (result: any) => {
                if (result != null && result.statusCode === 200) {
                    project.setAutoBuild(newAutoBuild);
                }
            });
    }

    export async function requestToggleEnablement(project: Project): Promise<void> {
        const newEnablement: boolean = !project.state.isEnabled;
        const newEnablementStr: string = newEnablement ? "Enable" : "Disable";

        const url = Endpoints.getProjectEndpoint(project.connection, project.id, Endpoints.ENABLEMENT_ACTION(newEnablement));
        return doProjectRequest(project, url, {}, request.put, newEnablementStr);
    }

    export async function requestValidate(project: Project): Promise<void> {
        const body = {
            projectID: project.id,
            projectType: project.type.internalType
        };

        const url = Endpoints.getEndpoint(project.connection, Endpoints.VALIDATE_ACTION);
        // validate requests are silent.
        return doProjectRequest(project, url, body, request.post);
    }

    export async function requestGenerate(project: Project): Promise<void> {
        const body = {
            projectID: project.id,
            projectType: project.type.internalType,
            autoGenerate: true
        };

        const url = Endpoints.getEndpoint(project.connection, Endpoints.GENERATE_ACTION);
        return doProjectRequest(project, url, body, request.post, "Generate Dockerfile")
            // request a validate after the generate so that the validation errors go away faster
            .then( () => requestValidate(project));
    }

    /**
     * Perform a REST request of the type specific by `requestFunc` to the project endpoint for the given project.
     * Displays a message to the user that the request succeeded if userOperationName is not null.
     * Always displays a message to the user in the case of an error.
     */
    export async function doProjectRequest(
            project: Project, url: string, body: {},
            requestFunc: (uri: string, options: request.RequestPromiseOptions) => request.RequestPromise<any>,
            userOperationName?: string): Promise<any> {

        Log.i(`Doing ${userOperationName != null ? userOperationName + " " : ""}request to ${url}`);

        const options = {
            json: true,
            body: body,
            resolveWithFullResponse: true
        };

        return requestFunc(url, options)
            .then( (result: any) => {
                Log.i(`Response code ${result.statusCode} from ${userOperationName} request for ${project.name}:`, result);
                if (userOperationName != null) {
                    vscode.window.showInformationMessage(`${userOperationName} requested for ${project.name}`);
                }
                return result;
            })
            .catch( (err: any) => {
                Log.w(`Error doing ${userOperationName} project request for ${project.name}:`, err);

                // If the server provided a specific message, present the user with that,
                // otherwise show them the whole error (but it will be ugly)
                const errMsg = err.error ? err.error : err;
                vscode.window.showErrorMessage(`${userOperationName} failed: ${errMsg}`);
                return err;
            });
    }
}

export default Requester;
