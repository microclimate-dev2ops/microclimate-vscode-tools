
import { TreeItem, TreeDataProvider, Event, EventEmitter, TreeItemCollapsibleState } from "vscode";

import  TreeItemAdaptable, { SimpleTreeItem } from "view/projectExplorer/TreeItemAdaptable";
import ConnectionManager from "microclimate/connection/ConnectionManager";
import { getIconObj } from "MCUtil";

export default class ProjectTreeDataProvider implements TreeDataProvider<TreeItemAdaptable> {

    public readonly treeDataProvider: TreeDataProvider<{}> = this;
    public readonly VIEW_ID: string = "ext.mc.projectExplorer";        // must match package.json

    private onChangeEmitter: EventEmitter<TreeItemAdaptable> = new EventEmitter<TreeItemAdaptable>();
    readonly onDidChangeTreeData: Event<TreeItemAdaptable> = this.onChangeEmitter.event;

    // private readonly root: TreeItemAdaptable;

    constructor() {
        ConnectionManager.instance.addOnChangeListener(this.refresh);
        // this.root = new SimpleTreeItem("Microclimate", TreeItemCollapsibleState.Expanded, ConnectionManager.instance.connections);
    }

    // "instance arrow function" here ensures proper 'this' binding when used as a callback
    // "https://github.com/Microsoft/TypeScript/wiki/'this'-in-TypeScript"
    public refresh = (): void => {
        // console.log("Refresh tree");
        this.onChangeEmitter.fire();
    }

    getTreeItem(node: TreeItemAdaptable): TreeItem | Promise<TreeItem> {
        return node.toTreeItem();
    }

    getChildren(node?: TreeItemAdaptable): TreeItemAdaptable[] | Promise<TreeItemAdaptable[]> {
        if (!node) {
            const connections = ConnectionManager.instance.connections;
            if (connections.length > 0) {
                return connections;
            }
            else {
                const noConnectionsRoot = new SimpleTreeItem("No Microclimate connections", TreeItemCollapsibleState.None);
                noConnectionsRoot.treeItem.iconPath = getIconObj("connection.svg");
                noConnectionsRoot.treeItem.tooltip = "Click the New Microclimate connection button above";
                return [ noConnectionsRoot ];
            }
        }

        return node.getChildren();
    }
}
