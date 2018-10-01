import * as vscode from "vscode";
import newConnectionCmd from "./NewConnectionCmd";
import goToFolder from "./GoToFolderCmd";
import restartProjectCmd from "./RestartProjectCmd";
import openInBrowserCmd from "./OpenInBrowser";

export default function createCommands() {
    
    return [
        vscode.commands.registerCommand("ext.mc.newConnection", () => newConnectionCmd()),
        vscode.commands.registerCommand("ext.mc.goToFolder", (args) => goToFolder(args)),

        vscode.commands.registerCommand("ext.mc.restartProjectRun", (args) => restartProjectCmd(args, false)),
        vscode.commands.registerCommand("ext.mc.restartProjectDebug", (args) => restartProjectCmd(args, true)),

        vscode.commands.registerCommand("ext.mc.openInBrowser", (args) => openInBrowserCmd(args))
        
    ];
}