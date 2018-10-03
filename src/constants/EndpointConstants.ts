import { Uri } from "vscode";

/**
 * Class to hold constants that are Portal API endpoint paths
 */
export default class Endpoints {

    public static getEndpointPath(baseUri: Uri, endpoint: string) {
        return Uri.parse(baseUri.toString().concat(endpoint));
    }

    public static readonly PROJECTS: string = "api/v1/projects";

    public static readonly RESTART_ACTION = (projectID: string): string => `${Endpoints.PROJECTS}/${projectID}/restart`;

    public static readonly BUILD_ACTION = (projectID: string): string => `${Endpoints.PROJECTS}/${projectID}/build`;
}