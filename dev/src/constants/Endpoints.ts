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
import Connection from "../microclimate/connection/Connection";

export type Endpoint = MCEndpoints | ProjectEndpoints;

// non-nls-file
/**
 *  "Regular" endpoints, eg "localhost:9090/api/v1/environment"
 */
export enum MCEndpoints {
    ENVIRONMENT = "api/v1/environment",
    PROJECTS = "api/v1/projects",
    PROJECTS_V2 = "api/v2/projects",
    // Deprecated
    VALIDATE_OLD = "api/v1/validate",
    // Deprecated
    GENERATE_OLD = "api/v1/validate/generate",
}

/**
 * Project endpoints, eg "localhost:9090/api/v1/project/81eba580-0aea-11e9-b530-67b2995d0cd9/restart"
 */
export enum ProjectEndpoints {
    RESTART_ACTION = "restart",
    BUILD_ACTION = "build",
    VALIDATE = "validate",
    GENERATE = "validate/generate",
    PROPERTES = "properties",
    LOGS = "logs",

    OPEN = "open",
    CLOSE = "close",
    NONE = "",
}

/**
 * Functions for resolving Portal endpoints
 */
export namespace EndpointUtil {

    export function isProjectEndpoint(endpoint: Endpoint): boolean {
        return Object.values(ProjectEndpoints).includes(endpoint);
    }

    export function resolveMCEndpoint(connection: Connection, endpoint: MCEndpoints): string {
        return connection.mcUri.toString().concat(endpoint);
    }

    /**
     * Use the v2 API for the following endpoints
     */
    const v2Endpoints: Endpoint[] = [
        ProjectEndpoints.PROPERTES,
    ];

    export function resolveProjectEndpoint(
        connection: Connection, projectID: string, endpoint: ProjectEndpoints): string {
        const projectsPath = v2Endpoints.includes(endpoint) ? MCEndpoints.PROJECTS_V2 : MCEndpoints.PROJECTS;
        return connection.mcUri.toString().concat(`${projectsPath}/${projectID}/${endpoint}`);
    }

    export function resolveAppMonitorUrl(connection: Connection, projectID: string): Uri {
        return connection.mcUri.with({ query: `project=${projectID}&view=monitor` });
    }

    const QUERY_NEW_PROJECT:        string = "new-project=true";
    const QUERY_IMPORT_PROJECT:     string = "import-project=true";

    export function resolveCreateOrImportUrl(connection: Connection, create: boolean): Uri {
        const query = create ? QUERY_NEW_PROJECT : QUERY_IMPORT_PROJECT;
        return connection.mcUri.with({ query });
    }

    export function getEnablementAction(enable: boolean): ProjectEndpoints {
        return enable ? ProjectEndpoints.OPEN : ProjectEndpoints.CLOSE;
    }
}

export default EndpointUtil;
