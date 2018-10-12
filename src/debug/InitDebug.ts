import * as vscode from "vscode";
import JavaDebugConfigProvider from "debug/JavaDebugConfigProvider";

export default function createDebug() {

    return [
        vscode.debug.registerDebugConfigurationProvider("java", new JavaDebugConfigProvider())
    ];
}