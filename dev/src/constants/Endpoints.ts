/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import { Uri } from "vscode";
import { Connection } from "../microclimate/connection/ConnectionExporter";

// non-nls-file

/**
 * Class to hold URL-related constants like endpoint paths, querystrings, ports,
 * and generate URLs from them.
 */
export default class Endpoints {

    // "regular" endpoints, eg "localhost:9090/api/v1/environment"
    public static readonly ENVIRONMENT: string = "api/v1/environment";
    public static readonly PROJECTS: string = "api/v1/projects";
    // Deprecated
    public static readonly VALIDATE_OLD: string = "api/v1/validate";
    // Deprecated
    public static readonly GENERATE_OLD: string = "api/v1/validate/generate";

    public static getEndpoint(connection: Connection, endpoint: string): Uri {
        return connection.mcUrl.with({ path: endpoint });
    }

    // Project endpoints, eg "localhost:9090/api/v1/project/81eba580-0aea-11e9-b530-67b2995d0cd9/restart"
    public static readonly RESTART_ACTION:  string = "restart";
    public static readonly BUILD_ACTION:    string = "build";
    public static readonly BUILD_LOG:       string = "build-log";
    public static readonly VALIDATE:        string = "validate";
    public static readonly GENERATE:        string = "validate/generate";

    public static getProjectEndpoint(connection: Connection, projectID: string, endpoint: string): Uri {
        return connection.mcUrl.with({ path: `${Endpoints.PROJECTS}/${projectID}/${endpoint}` });
    }

    public static getAppMonitorUrl(connection: Connection, projectID: string): Uri {
        return connection.mcUrl.with({ query: `project=${projectID}&view=monitor` });
    }

    private static readonly QUERY_NEW_PROJECT:      string = "new-project=true";
    private static readonly QUERY_IMPORT_PROJECT:   string = "import-project=true";

    public static getCreateOrImportUrl(connection: Connection, create: boolean): Uri {
        const query = create ? this.QUERY_NEW_PROJECT : this.QUERY_IMPORT_PROJECT;
        return connection.mcUrl.with({ query });
    }

    public static getEnablementAction(enable: boolean): string {
        return `${enable ? "open" : "close"}`;
    }

    public static readonly ICP_MASTER_SERVER_PORT: number = 8443;
    public static readonly ICP_OIDC_SERVER_PATH: string = "/oidc/endpoint/OP";
}
