import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import Log from "../Logger";
import ProjectState from "../microclimate/project/ProjectState";
import Requester from "../microclimate/project/Requester";

export default async function toggleAutoBuildCmd(project: Project): Promise<void> {
    Log.d("ToggleAutoBuildCmd invoked");

    if (project == null) {
        const selected = await promptForProject(...ProjectState.getEnabledStates());
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    return Requester.requestToggleAutoBuild(project);
}
