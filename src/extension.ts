"use strict";
import * as vscode from "vscode";

import { createCommands } from "./command/CommandUtil";
import createViews from "./view/InitViews";
import createDebug from "./debug/InitDebug";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    global.__extRoot = context.extensionPath;

    const msg = "Microclimate Tools for VSCode are active!";
    console.log(msg);
    vscode.window.showInformationMessage(msg);

    const subscriptions: any[] = [
        ...createViews(),
        ...createCommands(),
        ...createDebug()
    ];

    subscriptions.forEach((e) => {
        // console.log("Adding subscription " + util.inspect(e));
        context.subscriptions.push(e);
    });
}

// this method is called when your extension is deactivated
export function deactivate() {
}