// import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import { ProjectState } from "../microclimate/project/ProjectState";
import { Logger } from "../Logger";

/**
 * @param enable - Whether the given project is to be enabled, or disabled.
 * IE if enable=true, the command will only succeed if the project is disabled when the command is invoked.
 */
export default async function toggleEnablementCmd(project: Project, enable: Boolean): Promise<void> {
    Logger.log("ToggleEnablementCmd invoked");
    if (project == null) {
        let acceptStates;
        if (enable) {
            acceptStates = [ProjectState.AppStates.DISABLED];
        }
        else {
            acceptStates = ProjectState.getEnabledStates();
        }

        const selected = await promptForProject(...acceptStates);
        if (selected == null) {
            // user cancelled
            Logger.log("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    Logger.log(`Toggle enablement for project ${project.name}`);

    project.connection.toggleEnablement(project);
}