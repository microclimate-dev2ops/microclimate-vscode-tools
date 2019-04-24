/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import ConnectionManager from "../microclimate/connection/ConnectionManager";
// import Commands from "../constants/Commands";
import Log from "../Logger";
import Project from "../microclimate/project/Project";
import Connection from "../microclimate/connection/Connection";
import Resources from "../constants/Resources";

// const STRING_NS = StringNamespaces.TREEVIEW;

export type MicroclimateTreeItem = Connection | Project | vscode.TreeItem;

export default class ProjectTreeDataProvider implements vscode.TreeDataProvider<MicroclimateTreeItem> {

    private static _instance: ProjectTreeDataProvider;

    private readonly VIEW_ID: string = "ext.mc.mcProjectExplorer";        // must match package.nls.json
    public readonly treeView: vscode.TreeView<MicroclimateTreeItem>;

    private readonly onTreeDataChangeEmitter: vscode.EventEmitter<MicroclimateTreeItem> = new vscode.EventEmitter<MicroclimateTreeItem>();
    public readonly onDidChangeTreeData: vscode.Event<MicroclimateTreeItem> = this.onTreeDataChangeEmitter.event;

    private constructor() {
        this.treeView = vscode.window.createTreeView(this.VIEW_ID, { treeDataProvider: this });
        ConnectionManager.instance.addOnChangeListener(this.refresh);
        Log.d("Finished constructing ProjectTree");
    }

    public static get treeViewInstance(): vscode.TreeView<MicroclimateTreeItem> {
        if (ProjectTreeDataProvider._instance == null) {
            this._instance = new ProjectTreeDataProvider();
        }
        return this._instance.treeView;
    }

    public static select(item: MicroclimateTreeItem): void {
        this.treeViewInstance.reveal(item, { select: true, focus: false });
    }

    /**
     * Notifies VSCode that this tree has to be refreshed.
     * Used as a call-back for ConnectionManager OnChange.
     */
    public refresh = (treeItem: MicroclimateTreeItem | undefined): void => {
        // Log.d("refresh tree");

        this.onTreeDataChangeEmitter.fire(treeItem);
    }

    public getTreeItem(node: MicroclimateTreeItem): vscode.TreeItem | Promise<vscode.TreeItem> {
        if (node instanceof Project || node instanceof Connection) {
            return node.toTreeItem();
        }
        else if (node instanceof vscode.TreeItem) {
            return node;
        }
        Log.e("Unexpected object to convert to TreeItem", node);
        return node;
    }

    public getChildren(node?: MicroclimateTreeItem): MicroclimateTreeItem[] | Promise<MicroclimateTreeItem[]> {
        if (node == null) {
            // root
            // connections are the top-level tree items
            if (ConnectionManager.instance.connections.length === 0) {
                const noConnectionsTi = new vscode.TreeItem("No connections");
                noConnectionsTi.iconPath = Resources.getIconPaths(Resources.Icons.Microclimate);
                noConnectionsTi.tooltip = "Run the New Microclimate Connection command";
                return [ noConnectionsTi ];
            }
            return ConnectionManager.instance.connections;
        }
        else if (node instanceof Connection) {
            return node.getProjects();
        }
        // else if (node instanceof Project) {
        //     return [];
        // }
        return [];
    }

    public getParent(node: MicroclimateTreeItem): MicroclimateTreeItem | Promise<MicroclimateTreeItem> | undefined {
        if (node instanceof Project) {
            return node.connection;
        }
        else if (node instanceof Connection) {
            return undefined;
        }
        Log.e("Unexpected TreeItem!", node);
        return undefined;
    }
}
