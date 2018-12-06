/*******************************************************************************
 * Copyright (c) 2018 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/


import * as vscode from "vscode";

import ITreeItemAdaptable, { SimpleTreeItem } from "./TreeItemAdaptable";
import ConnectionManager from "../microclimate/connection/ConnectionManager";
import { Icons, getIconPaths } from "../constants/Resources";
import Commands from "../constants/Commands";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

const STRING_NS = StringNamespaces.TREEVIEW;

export default class ProjectTreeDataProvider implements vscode.TreeDataProvider<ITreeItemAdaptable> {

    public readonly treeDataProvider: vscode.TreeDataProvider<{}> = this;
    public readonly VIEW_ID: string = "ext.mc.mcProjectExplorer";        // must match package.json

    private readonly onChangeEmitter: vscode.EventEmitter<ITreeItemAdaptable> = new vscode.EventEmitter<ITreeItemAdaptable>();
    public readonly onDidChangeTreeData: vscode.Event<ITreeItemAdaptable> = this.onChangeEmitter.event;

    constructor() {
        ConnectionManager.instance.addOnChangeListener(this.refresh);
    }

    /**
     * Notifies VSCode that this tree has to be refreshed.
     * Used as a call-back for ConnectionManager OnChange.
     */
    public refresh = (): void => {
        // Logger.log("Refresh tree");
        this.onChangeEmitter.fire();
    }

    /**
     * TreeDataProvider method to convert our custom TreeItemAdaptable class to a vscode.TreeItem
     */
    public getTreeItem(node: ITreeItemAdaptable): vscode.TreeItem | Promise<vscode.TreeItem> {
        return node.toTreeItem();
    }

    /**
     * TreeDataProvider method to get children for a given TreeItemAdaptable node, or provide the tree's root node.
     */
    public getChildren(node?: ITreeItemAdaptable): ITreeItemAdaptable[] | Promise<ITreeItemAdaptable[]> {
        if (node == null) {
            const connections = ConnectionManager.instance.connections;
            if (connections.length > 0) {
                // The top-level nodes of this tree are our Connections, and their children are their Projects
                return connections;
            }
            else {
                // Provide a root node if no Connections have been created
                const noConnectionsRoot = new SimpleTreeItem(Translator.t(STRING_NS, "noConnectionsLabel"), vscode.TreeItemCollapsibleState.None);
                noConnectionsRoot.treeItem.iconPath = getIconPaths(Icons.Microclimate);
                noConnectionsRoot.treeItem.tooltip = Translator.t(STRING_NS, "noConnectionsTooltip");
                // Clicking the no connections item runs the new connection command.
                noConnectionsRoot.treeItem.command = {
                    command: Commands.NEW_CONNECTION,
                    title: ""       // non-nls
                };
                return [ noConnectionsRoot ];
            }
        }
        else {
            return node.getChildren();
        }
    }
}
