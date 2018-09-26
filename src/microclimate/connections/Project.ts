import { Uri, TreeItemCollapsibleState } from "vscode";
import { MCTreeNode } from "../../view/projectExplorer/MCTreeNode";


export class Project implements MCTreeNode {

    public readonly label: string;
    readonly initCollapsedState = TreeItemCollapsibleState.None;

    getChildren(): Promise<MCTreeNode[]> {
        return new Promise<MCTreeNode[]>((resolve, reject) => {
            // No children
            resolve([]);
        });
    }

    constructor (
        public readonly name: string,
        public readonly id: string,
        public readonly type: string,           // should be an enum
        public readonly contextRoot: string,
        public readonly localPath: Uri,
    ) {
        if (type == null) {
            type = "Unknown";
        }

        this.label = this.name + ` [${type}]`;
    }

}