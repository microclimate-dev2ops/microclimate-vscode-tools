import * as vscode from "vscode";

import ConnectionManager from "../microclimate/connection/ConnectionManager";
import Connection from "../microclimate/connection/Connection";
import { promptForConnection } from "./CommandUtil";

export default async function removeConnectionCmd(connection: Connection): Promise<void> {
    console.log("removeConnectionCmd invoked");
    if (connection == null) {
        const selected = await promptForConnection();
        if (selected == null) {
            // user cancelled
            console.log("User cancelled project prompt");
            return;
        }
        connection = selected;
    }

    //const removed: Boolean = await ConnectionManager.instance.removeConnection(connection);
    ConnectionManager.instance.removeConnection(connection);
}