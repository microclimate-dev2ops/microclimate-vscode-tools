import * as vscode from "vscode";

import { promptForConnection } from "./CommandUtil";
import Log from "../Logger";
import Connection from "../microclimate/connection/Connection";


export default async function refreshConnectionCmd(connection: Connection): Promise<void> {
    Log.d("refreshConnectionCmd");
    if (connection == null) {
        const selected = await promptForConnection();
        if (selected == null) {
            // user cancelled
            Log.i("User cancelled project prompt");
            return;
        }
        connection = selected;
    }

    vscode.window.showInformationMessage(`Refreshing Microclimate at ${connection.mcUri}`);
    return connection.forceUpdateProjectList();
}