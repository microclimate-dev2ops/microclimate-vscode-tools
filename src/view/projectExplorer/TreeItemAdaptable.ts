import { TreeItemCollapsibleState, TreeItem } from "vscode";

export interface TreeItemAdaptable {

    toTreeItem(): TreeItem | Promise<TreeItem>;
    getChildren(): TreeItemAdaptable[] | Promise<TreeItemAdaptable[]>;
}

export class SimpleTreeItem implements TreeItemAdaptable {

    constructor(
        public readonly label: string,
        public readonly initCollapseState: TreeItemCollapsibleState,
        public readonly children: TreeItemAdaptable[]
    ) {

    }

    toTreeItem(): TreeItem {
        return new TreeItem(this.label, this.initCollapseState);
    }
    getChildren(): TreeItemAdaptable[] {
        return this.children;
    }
}

