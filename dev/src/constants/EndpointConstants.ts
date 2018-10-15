import { Uri } from "vscode";
import Connection from "../microclimate/connection/Connection";

/**
 * Class to hold constants that are Portal API endpoint paths
 */
export default class Endpoints {

    public static getEndpointPath(connection: Connection, endpoint: string) {
        return Uri.parse(connection.mcUri.toString().concat(endpoint));
    }

    public static readonly PROJECTS: string = "api/v1/projects";

    public static readonly RESTART_ACTION = (projectID: string): string => `${Endpoints.PROJECTS}/${projectID}/restart`;

    public static readonly BUILD_ACTION =   (projectID: string): string => `${Endpoints.PROJECTS}/${projectID}/build`;

    public static readonly ENABLEMENT_ACTION = (projectID: string, enable: Boolean): string => {
        return `${Endpoints.PROJECTS}/${projectID}/${enable ? "open" : "close"}`;
    }
}