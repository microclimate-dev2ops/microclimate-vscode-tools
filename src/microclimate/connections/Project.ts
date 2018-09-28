import { Uri, TreeItemCollapsibleState, TreeItem } from "vscode";
import { TreeItemAdaptable } from "../../view/projectExplorer/TreeItemAdaptable";

export default class Project implements TreeItemAdaptable {

    private static readonly CONTEXT_ID = "ext.mc.projectItem";             // must match package.json

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

        console.log("Create project", this);
    }

    getChildren(): TreeItemAdaptable[] {
        // Projects have no children.
        return [];
    }

    toTreeItem(): TreeItem {
        const ti = new TreeItem(`${this.name} [${this.type}]`, TreeItemCollapsibleState.None);
        ti.resourceUri = this.localPath;
        ti.tooltip = ti.resourceUri.fsPath.toString();
        ti.contextValue = Project.CONTEXT_ID;
        return ti;
    }
}