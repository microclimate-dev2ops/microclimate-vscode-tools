/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";
import Resources from "../constants/Resources";

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
        public readonly iconPaths?: Resources.IconPaths,
    ) {
       this.treeItem = new vscode.TreeItem(this.label, this.initCollapseState);
       this.treeItem.contextValue = contextID;
       this.treeItem.iconPath = iconPaths;
    }

    public toTreeItem(): vscode.TreeItem {
        return this.treeItem;
    }

    public getChildren(): ITreeItemAdaptable[] {
        return this.children;
    }
}
