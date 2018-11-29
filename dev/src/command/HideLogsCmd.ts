import * as vscode from "vscode";

import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import MCLog from "../microclimate/logs/MCLog";
import Log from "../Logger";

const STRING_NS = StringNamespaces.LOGS;

export default async function hideLogsCmd(): Promise<void> {

    const quickPickItems: MCLog[] = ConnectionManager.instance.connections.reduce( (logs: MCLog[], connection): MCLog[] => {
        return logs.concat(connection.logManager.getAllOpenLogs());
    }, []);

    if (quickPickItems.length === 0) {
        vscode.window.showInformationMessage(Translator.t(STRING_NS, "noLogsToHide"));
        return;
    }

    const options: vscode.QuickPickOptions = {
        canPickMany: true
    };

    // https://github.com/Microsoft/vscode/issues/64014
    // const selection: vscode.QuickPickItem[] | undefined = await vscode.window.showQuickPick(quickPickItems, options);

    // The return type is an array of MCLogs, but we have to mark it as 'any' due to issue linked above
    const selection: any = await vscode.window.showQuickPick(quickPickItems, options);
    if (selection != null) {
        // Log.d("selection", selection);

        const logsToHide: MCLog[] = selection as MCLog[];

        Log.d(`Hiding ${logsToHide.length} logs`);
        logsToHide.forEach( (log) => {
            log.destroy();
        });
        // vscode.window.showInformationMessage(Translator.t(STRING_NS, "hidNLogs", { count: logsToHide.length }));
    }
}
