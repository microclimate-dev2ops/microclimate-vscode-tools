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

import ProjectType from "../microclimate/project/ProjectType";
import Log from "../Logger";

namespace TestConfig {
    interface ITestableProjectType {
        projectType: ProjectType;
        // We want to tests projects that can't be restarted too,
        // so tell the test whether or not the restart should succeed here.
        canRestart: boolean;

        // Set this after the project is created
        projectID?: string;
    }

    const allProjectTypes: ITestableProjectType[] = [
        {
            projectType: new ProjectType(ProjectType.InternalTypes.NODE, ProjectType.Languages.NODE),
            canRestart: true
        },
        {
            projectType: new ProjectType(ProjectType.InternalTypes.SPRING, ProjectType.Languages.JAVA),
            canRestart: true
        },
        {
            projectType: new ProjectType(ProjectType.InternalTypes.MICROPROFILE, ProjectType.Languages.JAVA),
            canRestart: true
        },
        {
            projectType: new ProjectType(ProjectType.InternalTypes.SWIFT, ProjectType.Languages.SWIFT),
            canRestart: false
        },
        {
            projectType: new ProjectType(ProjectType.InternalTypes.DOCKER, ProjectType.Languages.PYTHON),
            canRestart: false
        },
        {
            projectType: new ProjectType(ProjectType.InternalTypes.DOCKER, ProjectType.Languages.GO),
            canRestart: false
        }
    ];

    const TYPES_ENV_VAR = "projectTypes";
    const SCOPE_ENV_VAR = "testScope";

    export function getProjectTypesToTest(): ITestableProjectType[] {
        const envProjectTypes = process.env[TYPES_ENV_VAR];

        if (!envProjectTypes) {
            Log.e(`No project types set! You have to set the environment variable "${TYPES_ENV_VAR}". `
                + `See ProjectType.Types for supported types.`);
            return [];
        }

        const rawTypes = splitByComma(envProjectTypes);
        return allProjectTypes.filter((type) => {
            return rawTypes.includes(type.projectType.toString().toLowerCase());
        });
    }

    export function isScopeEnabled(scope: string): boolean {
        const envScope = process.env[SCOPE_ENV_VAR];
        if (!envScope) {
            Log.t(`${SCOPE_ENV_VAR} environment variable is not set`);
            // if nothing is set, run all scopes
            return true;
        }
        else {
            return splitByComma(envScope).includes(scope);
        }
    }

    function splitByComma(s: string): string[] {
        return s.split(",").map((s_) => s_.toLowerCase().trim());
    }
}

export default TestConfig;
