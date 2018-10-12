import { window } from "vscode";

import ProjectTreeDataProvider from "view/projectExplorer/ProjectTree";

export default function createViews() {
    const treeDataProvider: ProjectTreeDataProvider = new ProjectTreeDataProvider();

    return [
        window.createTreeView(treeDataProvider.VIEW_ID, treeDataProvider),
        window.registerTreeDataProvider(treeDataProvider.VIEW_ID, treeDataProvider)
    ];
}