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
    // debuggable implies (enabled and not disabled)
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
