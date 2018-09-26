import { TreeItemCollapsibleState } from "vscode";
import ConnectionManager from "../../microclimate/connections/ConnectionManager";

export interface MCTreeNode {
    readonly label: string;
    readonly initCollapsedState: TreeItemCollapsibleState;

    getChildren(): Promise<MCTreeNode[]>;
}

export class RootNode implements MCTreeNode {
    label = "Microclimate";  
    initCollapsedState = TreeItemCollapsibleState.Expanded;

    getChildren(): Promise<MCTreeNode[]> {
        return ConnectionManager.instance.getConnections();
    }
}