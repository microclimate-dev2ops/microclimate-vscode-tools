import { window } from "vscode";

import { ProjectTreeDataProvider } from "./projectExplorer/ProjectTree";

export default function createViews() {
    const treeDataProvider: ProjectTreeDataProvider = new ProjectTreeDataProvider();
    console.log("CreateViews");

    return [
        window.createTreeView(treeDataProvider.viewId, treeDataProvider),
        window.registerTreeDataProvider(treeDataProvider.viewId, treeDataProvider)
    ];
}