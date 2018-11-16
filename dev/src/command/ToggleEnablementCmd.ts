// import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import ProjectState from "../microclimate/project/ProjectState";
import Log from "../Logger";
import Requester from "../microclimate/project/Requester";

/**
 * @param enable - Whether the given project is to be enabled, or disabled.
 * IE if enable=true, the command will only succeed if the project is disabled when the command is invoked.
 */
export default async function toggleEnablementCmd(project: Project, enable: boolean): Promise<void> {
    Log.d("ToggleEnablementCmd invoked");
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
            Log.d("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    Log.i(`Toggle enablement for project ${project.name}`);

    Requester.requestToggleEnablement(project);
}
