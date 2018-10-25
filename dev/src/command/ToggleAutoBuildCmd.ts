import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import { Logger } from "../Logger";
import Connection from "../microclimate/connection/Connection";
import { ProjectState } from "../microclimate/project/ProjectState";
// import ConnectionManager from "../microclimate/connection/ConnectionManager";

export const TOGGLE_AUTOBUILD_CMD_ID = "ext.mc.toggleAutoBuild";

export default async function toggleAutoBuildCmd(project: Project): Promise<void> {
    Logger.log("ToggleAutoBuildCmd invoked");

    if (project == null) {
        const selected = await promptForProject(...ProjectState.getEnabledStates());
        if (selected == null) {
            // user cancelled
            Logger.log("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    Connection.requestToggleAutoBuild(project);
}
