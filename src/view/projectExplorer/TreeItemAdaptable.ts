import * as vscode from "vscode";
import * as path from "path";
import { getIconObj } from "../../MCUtil";

export interface TreeItemAdaptable {

    toTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem>;
    getChildren(): TreeItemAdaptable[] | Promise<TreeItemAdaptable[]>;
}

export class SimpleTreeItem implements TreeItemAdaptable {

    constructor(
        public readonly label: string,
        public readonly initCollapseState: vscode.TreeItemCollapsibleState,
        public readonly children: TreeItemAdaptable[]
    ) {

    }

    toTreeItem(): vscode.TreeItem {
        const ti = new vscode.TreeItem(this.label, this.initCollapseState);
        ti.iconPath = getIconObj("microclimate.svg");
        return ti;
    }

    getChildren(): TreeItemAdaptable[] {
        return this.children;
    }
}

