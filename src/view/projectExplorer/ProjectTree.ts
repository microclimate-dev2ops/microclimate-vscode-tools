
import { TreeItem, TreeDataProvider, Event, EventEmitter } from 'vscode';

import { MCTreeNode, RootNode } from './MCTreeNode';
import ConnectionManager from '../../microclimate/connections/ConnectionManager';

class ProjectTreeDataProvider implements TreeDataProvider<MCTreeNode> {

    public readonly treeDataProvider: TreeDataProvider<{}> = this;
    public readonly viewId: string = "ext.mc.projectExplorer";        // must match package.json

    private onChangeEmitter: EventEmitter<MCTreeNode> = new EventEmitter<MCTreeNode>();
    readonly onDidChangeTreeData: Event<MCTreeNode> = this.onChangeEmitter.event;

    readonly root = new RootNode();

    constructor() {
        ConnectionManager.instance.addOnChangeListener(this.refresh);
    }

    // "instance arrow function" here ensures proper 'this' binding
    // "https://github.com/Microsoft/TypeScript/wiki/'this'-in-TypeScript"
    public refresh = (): void => {
        console.log("Refresh tree");
        this.onChangeEmitter.fire();
    }

    getTreeItem(node: MCTreeNode): TreeItem {
        return new TreeItem(node.label, node.initCollapsedState);
    }

    getChildren(node?: MCTreeNode): MCTreeNode[] | Promise<MCTreeNode[]> {
        if (!node) {
            return [ this.root ];
        }

        return node.getChildren();
        // const childNodes: MCTreeNode[] = await node.getChildren();
        /*
        
        const childTreeItems: TreeItem[] = childNodes.map((node) => {
            return new TreeItem(node.label, node.initCollapsedState);
        });

        return new Promise<TreeItem[]> ((resolve, reject) => {
            resolve(childTreeItems);
        });*/
    }

    /*
    getParent(node: ProjectNode): ProjectNode {
        return null;
    }*/

}

export {
    ProjectTreeDataProvider
};