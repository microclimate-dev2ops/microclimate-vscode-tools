/*******************************************************************************
 * Copyright (c) 2018 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import ProjectType from "../microclimate/project/ProjectType";

namespace TestConfig {
    interface ITestableProjectType {
        // change this variable to run the tests on this type
        runTest: boolean;

        projectType: ProjectType;
        // We want to tests projects that can't be restarted too,
        // so tell the test whether or not the restart should succeed here.
        canRestart: boolean;
        projectID?: string;
        projectName?: string;
    }

    const allProjectTypes: ITestableProjectType[] = [
        {
            runTest: true,
            projectType: new ProjectType(ProjectType.InternalTypes.NODE, ProjectType.Languages.NODE),
            canRestart: true
        },
        {
            runTest: false,
            projectType: new ProjectType(ProjectType.InternalTypes.SPRING, ProjectType.Languages.JAVA),
            canRestart: true
        },
        {
            runTest: false,
            projectType: new ProjectType(ProjectType.InternalTypes.MICROPROFILE, ProjectType.Languages.JAVA),
            canRestart: true
        },
        {
            runTest: false,
            projectType: new ProjectType(ProjectType.InternalTypes.DOCKER, ProjectType.Languages.PYTHON),
            canRestart: false
        },
        {
            runTest: false,
            projectType: new ProjectType(ProjectType.InternalTypes.SWIFT, ProjectType.Languages.SWIFT),
            canRestart: false
        },
        {
            runTest: false,
            projectType: new ProjectType(ProjectType.InternalTypes.DOCKER, ProjectType.Languages.GO),
            canRestart: false
        }
    ];

    export const projectTypesToTest: ITestableProjectType[] = allProjectTypes.filter( (t) => t.runTest);
}

export default TestConfig;
