// import * as vscode from "vscode";

import { promptForProject } from "./CommandUtil";
import Log from "../Logger";
import ProjectState from "../microclimate/project/ProjectState";
import Requester from "../microclimate/project/Requester";
import Project from "../microclimate/project/Project";

export default async function validateCmd(project: Project): Promise<void> {
    Log.d("validateCmd invoked");
    if (project == null) {
        const selected = await promptForProject(...ProjectState.getEnabledStates());
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    return Requester.requestValidate(project, false);
}
