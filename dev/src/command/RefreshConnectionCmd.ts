import * as vscode from "vscode";

import { promptForConnection } from "./CommandUtil";
import Log from "../Logger";
import Connection from "../microclimate/connection/Connection";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

export default async function refreshConnectionCmd(connection: Connection): Promise<void> {
    Log.d("refreshConnectionCmd");
    if (connection == null) {
        const selected = await promptForConnection(true);
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return;
        }
        connection = selected;
    }

    vscode.window.showInformationMessage(Translator.t(StringNamespaces.CMD_MISC, "refreshingConnection", { uri: connection.mcUri }));
    return connection.forceUpdateProjectList(true);
}
