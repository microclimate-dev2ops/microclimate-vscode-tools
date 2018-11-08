import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import { promptForProject } from "./CommandUtil";
import Log from "../Logger";
import Commands from "../constants/Commands";

export default async function openAppMonitorCmd(project: Project): Promise<void> {
    Log.i("openAppMonitorCmd invoked");
    if (project == null) {
        const selected = await promptForProject();
        if (selected == null) {
            Log.i("User cancelled prompt for resource");
            // user cancelled
            return;
        }
        project = selected;
    }

    const qp: string = `project=${project.id}&view=monitor`;
    const monitorPageUrl: vscode.Uri = project.connection.mcUri.with({ query: qp });
    Log.i("Open monitor at " + monitorPageUrl);
    vscode.commands.executeCommand(Commands.VSC_OPEN, monitorPageUrl);
}