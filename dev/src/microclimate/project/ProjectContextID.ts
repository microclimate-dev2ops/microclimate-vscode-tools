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

import Project from "./Project";
import ProjectState from "./ProjectState";

// All the strings in this file must match the regexes in package.nls.json.

// non-nls-file

const BASE_CONTEXT_ID = "ext.mc.projectItem";
const SEPARATOR = ".";

/**
 * A list of states a project can be in that affects its context ID and therefore enabled context menu options.
 */
enum ContextOptions {
    // (en|dis)abled are mutex
    ENABLED = "enabled",
    // debuggable implies enabled
    DISABLED = "disabled",

    DEBUGGABLE = "debuggable",

    // auto build statuses are mutex
    AUTO_BUILD_ON = "autoBuildOn",
    AUTO_BUILD_OFF = "autoBuildOff"
}

export default function getContextID(project: Project): string {
    const options: ContextOptions[] = [];

    if (project.state.isEnabled) {
        options.push(ContextOptions.ENABLED);
        if (ProjectState.getDebuggableStates().includes(project.state.appState)) {
            options.push(ContextOptions.DEBUGGABLE);
        }
    }
    else {
        options.push(ContextOptions.DISABLED);
    }

    if (project.autoBuildEnabled) {
        options.push(ContextOptions.AUTO_BUILD_ON);
    }
    else {
        options.push(ContextOptions.AUTO_BUILD_OFF);
    }

    return BASE_CONTEXT_ID + SEPARATOR + options.join(SEPARATOR);

}
