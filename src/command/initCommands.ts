import * as vscode from "vscode";
import newConnectionCmd from "./NewConnectionCmd";
import goToFolder from "./GoToFolderCmd";

export default function createCommands() {
    
    return [
        vscode.commands.registerCommand("ext.mc.newConnection", () => newConnectionCmd()),
        vscode.commands.registerCommand("ext.mc.goToFolder", (args) => goToFolder(args))
        // commands.registerCommand("ext.mc.openProject", (args) => openProjectCmd())
    ];
}