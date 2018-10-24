"use strict";
import * as vscode from "vscode";

import { createCommands } from "./command/CommandUtil";
import createViews from "./view/InitViews";
import { Logger } from "./Logger";
// import createDebug from "./debug/InitDebug";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext): void {

    // Initialize our globals
    global.__extRoot = context.extensionPath;
    Logger.setLogFilePath(context);
    Logger.log("Finished activating logger");

    const msg = "Microclimate Tools for VSCode are active!";
    Logger.log(msg);
    vscode.window.showInformationMessage(msg);

    ignoreMCFiles();

    const subscriptions: any[] = [
        ...createViews(),
        ...createCommands(),
        // ...createDebug()
    ];

    subscriptions.forEach((e) => {
        // Logger.log("Adding subscription " + util.inspect(e));
        context.subscriptions.push(e);
    });
}

// this method is called when your extension is deactivated
export function deactivate(): void {
}

const excludeSection = "exclude";
const prePattern = "**/";
// files or directories, doesn't matter, trailing / not required.
const filesToIgnore: string[] = [
    ".Trash-0",
    ".config",
    ".extensions",
    ".idc",
    ".license-accept",
    ".logs",
    ".nyc_output",
    ".projects"
];

/**
 * Add to the user's `files.exclude` setting to exclude a bunch of files
 * in the microclimate-workspace that the user probably doesn't want to see.
 */
async function ignoreMCFiles(): Promise<void> {
    const filesConfig = vscode.workspace.getConfiguration("files", null);
    const existing: any = filesConfig.get<{}>(excludeSection) || {};

    filesToIgnore.forEach( (toIgnore) => {
        const newIgnore = prePattern + toIgnore;
        if (existing[newIgnore] == null) {
            // If the user already set it to false, don't undo that!
            existing[newIgnore] = true;
        }
    });

    filesConfig.update(excludeSection, existing, vscode.ConfigurationTarget.Workspace);
}