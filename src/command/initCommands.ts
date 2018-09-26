import { commands } from "vscode";
import newConnectionCmd from "./NewConnectionCmd";


function createCommands() {
    
    return [
        commands.registerCommand("ext.mc.newConnection", (args) => newConnectionCmd()),
        // commands.registerCommand("ext.mc.openProject", (args) => openProjectCmd())
    ];
}

export {
    createCommands
};