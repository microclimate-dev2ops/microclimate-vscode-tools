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

// non-nls-file

namespace SocketEvents {

    export const STATUS_SUCCESS: string = "success";

    // from https://github.ibm.com/dev-ex/microclimate/blob/master/docker/file-watcher/server/src/projects/actions.ts - "restart" function
    export interface IProjectRestartedEvent {
        operationID: string;
        projectID: string;
        status: string;
        errorMsg?: string;
        startMode?: string;
        ports?: {
            // these are actually sent as strings, and will be coerced to numbers.
            exposedPort: number;
            internalPort: number;
            exposedDebugPort?: number;
            internalDebugPort?: number;
        };
    }

        // from https://github.ibm.com/dev-ex/microclimate/blob/master/docker/file-watcher/server/src/projects/Validator.ts#L144
    export interface IValidationResult {
        // severity: Severity;
        severity: string;
        filename: string;
        filepath: string;
        // type: ProblemType
        label: string;
        details: string;
        quickfix?: {
            fixID: string,
            name: string,
            description: string
        };
    }

    /**
     * Socket events we listen for from Microclimate Portal
     * See MCSocket
     */
    export enum Types {
        PROJECT_CHANGED = "projectChanged",
        PROJECT_STATUS_CHANGED = "projectStatusChanged",
        PROJECT_CLOSED = "projectClosed",
        PROJECT_DELETION = "projectDeletion",
        PROJECT_RESTART_RESULT = "projectRestartResult",
        CONTAINER_LOGS = "container-logs",
        PROJECT_VALIDATED = "projectValidated"
    }

    /**
     * Property keys we check in Microclimate socket events
     */
    export enum Keys {
        APP_STATE = "appStatus",
        BUILD_STATE = "buildStatus",
        CLOSED_STATE = "state",
        START_MODE = "startMode",
        BUILD_DETAIL = "detailedBuildStatus"
    }
}

export default SocketEvents;
