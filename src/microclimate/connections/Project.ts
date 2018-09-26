import { Uri, TreeItemCollapsibleState, TreeItem } from "vscode";
import { TreeItemAdaptable } from "../../view/projectExplorer/TreeItemAdaptable";


export class Project implements TreeItemAdaptable {

    constructor (
        public readonly name: string,
        public readonly id: string,
        public readonly type: string,           // should be an enum
        public readonly contextRoot: string,
        public readonly localPath: Uri,
    ) {
        if (!type) {
            this.type = "unknown";
        }
    }

    getChildren(): TreeItemAdaptable[] {
        // Projects have no children.
        return [];
    }

    toTreeItem(): TreeItem {
        const ti = new TreeItem(`${this.name} [${this.type}]`, TreeItemCollapsibleState.None);
        ti.resourceUri = this.localPath;
        ti.tooltip = ti.resourceUri.toString();
        return ti;
    }
}