import { TreeItemCollapsibleState, TreeItem } from "vscode";
import ConnectionManager from "../../microclimate/connections/ConnectionManager";

export interface TreeItemAdaptable {

    toTreeItem(): TreeItem | Promise<TreeItem>;
    getChildren(): TreeItemAdaptable[] | Promise<TreeItemAdaptable[]>;
}

export class RootNode implements TreeItemAdaptable {
    
    getChildren(): TreeItemAdaptable[] {
        return ConnectionManager.instance.connections;
    }

    toTreeItem(): TreeItem {
        return new TreeItem("Microclimate", TreeItemCollapsibleState.Expanded);
    }
}