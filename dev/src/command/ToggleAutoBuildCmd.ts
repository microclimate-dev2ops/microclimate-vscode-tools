import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import Logger from "../Logger";
import ProjectState from "../microclimate/project/ProjectState";
import Requester from "../microclimate/project/Requester";

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

    Requester.requestToggleAutoBuild(project);
}
