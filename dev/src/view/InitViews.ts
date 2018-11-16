import * as vscode from "vscode";

import ProjectTreeDataProvider from "./ProjectTree";

export default function createViews(): vscode.Disposable[] {
    const treeDataProvider: ProjectTreeDataProvider = new ProjectTreeDataProvider();

    return [
        vscode.window.createTreeView(treeDataProvider.VIEW_ID, treeDataProvider),
        vscode.window.registerTreeDataProvider(treeDataProvider.VIEW_ID, treeDataProvider)
    ];
}
