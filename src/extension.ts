"use strict";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
// import * as util from 'util';
import { createCommands } from "./command/CommandUtil";
import createViews from "./view/InitViews";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    const msg = "Microclimate Tools for VSCode are active!";
    console.log(msg);
    vscode.window.showInformationMessage(msg);

    const subs: any[] = [
        ...createViews(),
        ...createCommands()
    ];

    subs.forEach((e) => {
        // console.log("Adding subscription " + util.inspect(e));
        context.subscriptions.push(e);
    });
}

// this method is called when your extension is deactivated
export function deactivate() {
}