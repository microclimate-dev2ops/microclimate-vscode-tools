import { Uri } from "vscode";
import Connection from "../microclimate/connection/Connection";

/**
 * Class to hold constants that are Portal API endpoint paths
 */
export default class Endpoints {

    public static getEndpoint(connection: Connection, endpoint: string): string {
        return connection.mcUri.toString().concat(endpoint);
    }

    public static getProjectEndpoint(connection: Connection, projectID: string, endpoint: string): string {
        return connection.mcUri.toString().concat(`${Endpoints.PROJECTS}/${projectID}/${endpoint}`);
    }

    public static readonly ENVIRONMENT: string = "api/v1/environment";

    public static readonly PROJECTS: string = "api/v1/projects";

    public static readonly VALIDATE_ACTION: string = "api/v1/validate";
    public static readonly GENERATE_ACTION: string = "api/v1/validate/generate";

    public static readonly RESTART_ACTION:  string = "restart";
    public static readonly BUILD_ACTION:    string = "build";
    public static readonly BUILD_LOG:       string = "build-log";

    //public static readonly DELETE: string =

    public static getAppMonitorUrl(connection: Connection, projectID: string): Uri {
        return connection.mcUri.with({ query: `project=${projectID}&view=monitor` });
    }

    public static getProjectCreationUrl(connection: Connection): Uri {
        return connection.mcUri.with({ query: "new-project=true" });
    }

    public static getEnablementAction(enable: boolean): string {
        return `${enable ? "open" : "close"}`;
    }

}
