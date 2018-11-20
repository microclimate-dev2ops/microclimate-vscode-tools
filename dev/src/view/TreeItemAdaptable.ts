import * as vscode from "vscode";

/**
 * Interface to allow easily converting any object to a vscode TreeItem.
 */
export default interface ITreeItemAdaptable {

    toTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem>;
    getChildren(): ITreeItemAdaptable[] | Promise<ITreeItemAdaptable[]>;
}

/**
 * Wrapper for TreeItem so that we can create standalone TreeItemAdaptables.
 */
export class SimpleTreeItem implements ITreeItemAdaptable {

    public readonly treeItem: vscode.TreeItem;

    constructor(
        public readonly label: string,
        public readonly initCollapseState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        public readonly children: ITreeItemAdaptable[] = [],
        public readonly contextID?: string,
    ) {
       this.treeItem = new vscode.TreeItem(this.label, this.initCollapseState);
       this.treeItem.contextValue = contextID;
    }

    public toTreeItem(): vscode.TreeItem {
        return this.treeItem;
    }

    public getChildren(): ITreeItemAdaptable[] {
        return this.children;
    }
}
