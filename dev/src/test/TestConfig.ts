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
        // The name of this project type's extension in Microclimate.
        // Undefined for node
        templateID: string | undefined;
        // We want to tests projects that can't be restarted too,
        // so tell the test whether or not the restart should succeed here.
        canRestart: boolean;

        // Set this after the project is created
        projectID?: string;
    }

    const testableProjectTypes: ITestableProjectType[] = [
        {
            projectType: new ProjectType(ProjectType.InternalTypes.NODE, ProjectType.Languages.NODE),
            canRestart: true,
            templateID: undefined,
        },
        {
            projectType: new ProjectType(ProjectType.InternalTypes.SPRING, ProjectType.Languages.JAVA),
            canRestart: true,
            templateID: "springJavaTemplate",
        },
        {
            projectType: new ProjectType(ProjectType.InternalTypes.MICROPROFILE, ProjectType.Languages.JAVA),
            canRestart: true,
            templateID: "springJavaTemplate",
        },
        {
            projectType: new ProjectType(ProjectType.InternalTypes.SWIFT, ProjectType.Languages.SWIFT),
            canRestart: false,
            templateID: "swiftTemplate",
        },
        {
            projectType: new ProjectType(ProjectType.InternalTypes.DOCKER, ProjectType.Languages.PYTHON),
            canRestart: false,
            templateID: "templateExample",
        },
        {
            projectType: new ProjectType(ProjectType.InternalTypes.DOCKER, ProjectType.Languages.GO),
            canRestart: false,
            templateID: "templateGoExample",
        }
    ];

    export function getTemplateID(projectType: ProjectType): string | undefined {
        const found = testableProjectTypes.find((tpt) => tpt.projectType === projectType);
        if (!found) {
            // The templates we use for tests are expected to always exist in Microclimate
            throw new Error("Did not find template corresponding to " + projectType);
        }
        return found.templateID;
    }

    const TYPES_ENV_VAR = "project_types";
    const SCOPE_ENV_VAR = "test_scope";
    const DEFAULT_TYPES = "node.js, spring, microprofile, go";

    export function getProjectTypesToTest(): ITestableProjectType[] {
        let envProjectTypes = process.env[TYPES_ENV_VAR];

        if (!envProjectTypes) {
            Log.w(`No project types set! Using default`);
            envProjectTypes = DEFAULT_TYPES;
        }

        const rawTypes = splitByComma(envProjectTypes);
        return testableProjectTypes.filter((type) => {
            return rawTypes.includes(type.projectType.toString().toLowerCase());
        });
    }

    export function isScopeEnabled(scope: string): boolean {
        const envScope = process.env[SCOPE_ENV_VAR];
        if (!envScope) {
            // Log.w(`${SCOPE_ENV_VAR} environment variable is not set`);
            // if nothing is set, run all scopes
            return true;
        }

        return splitByComma(envScope).includes(scope);
    }

    function splitByComma(s: string): string[] {
        return s.split(",").map((s_) => s_.toLowerCase().trim());
    }
}

export default TestConfig;
