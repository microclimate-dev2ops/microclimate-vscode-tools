import * as vscode from "vscode";

import ConnectionManager from "../microclimate/connection/ConnectionManager";
import Connection from "../microclimate/connection/Connection";
import { promptForConnection } from "./CommandUtil";
import Log from "../Logger";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

export default async function removeConnectionCmd(connection: Connection): Promise<void> {
    Log.d("removeConnectionCmd invoked");
    if (connection == null) {
        const selected = await promptForConnection();
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        connection = selected;
    }

    // const removed: boolean = await ConnectionManager.instance.removeConnection(connection);
    return ConnectionManager.instance.removeConnection(connection)
        .then( (result: boolean) => {
            if (result) {
                vscode.window.showInformationMessage(Translator.t(StringNamespaces.CMD_MISC, "removedConnection", { uri: connection.mcUri }));
            }
        });
}
