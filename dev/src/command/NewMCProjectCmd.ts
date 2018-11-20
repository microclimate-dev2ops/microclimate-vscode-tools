import * as vscode from "vscode";

import { promptForConnection } from "./CommandUtil";
import Log from "../Logger";
import Commands from "../constants/Commands";
import Connection from "../microclimate/connection/Connection";
import Endpoints from "../constants/Endpoints";

export default async function newMCProjectCmd(connection: Connection): Promise<void> {
    Log.d("newMCProjectCmd invoked");
    if (connection == null) {
        const selected = await promptForConnection();
        if (selected == null) {
            Log.d("User cancelled prompt for resource");
            // user cancelled
            return;
        }
        connection = selected;
    }

    const newProjectUrl = Endpoints.getProjectCreationUrl(connection);
    Log.i("Create new Microclimate project at " + newProjectUrl);
    vscode.commands.executeCommand(Commands.VSC_OPEN, newProjectUrl);
}
