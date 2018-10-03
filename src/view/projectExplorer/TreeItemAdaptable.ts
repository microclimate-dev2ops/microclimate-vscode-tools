import * as vscode from "vscode";

export default interface TreeItemAdaptable {

    toTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem>;
    getChildren(): TreeItemAdaptable[] | Promise<TreeItemAdaptable[]>;
}

export class SimpleTreeItem implements TreeItemAdaptable {

    public readonly treeItem: vscode.TreeItem;

    constructor(
        public readonly label: string,
        public readonly initCollapseState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        public readonly children: TreeItemAdaptable[] = []
    ) {
       this.treeItem = new vscode.TreeItem(this.label, this.initCollapseState);
    }

    toTreeItem(): vscode.TreeItem {
        return this.treeItem;
    }

    getChildren(): TreeItemAdaptable[] {
        return this.children;
    }
}

