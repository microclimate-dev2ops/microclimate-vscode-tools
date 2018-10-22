import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import Connection from "../microclimate/connection/Connection";
import { promptForResource } from "./CommandUtil";

export default async function openWorkspaceFolderCmd(resource: Project | Connection): Promise<void> {
    console.log(`Go to folder command invoked on ${resource}`);
    if (resource == null) {
        const selected = await promptForResource();
        if (selected == null) {
            console.log("User cancelled prompt for resource");
            // user cancelled
            return;
        }
        resource = selected;
    }

    let uri;
    if (resource instanceof Project) {
        uri = resource.localPath;
    }
    else if (resource instanceof Connection) {
        uri = resource.workspacePath;
    }
    else {
        const msg = `Could not get resource URI from object of type ${typeof(resource)}`;
        console.error(msg, resource);
        vscode.window.showErrorMessage(msg);
        return;
    }

    console.log("Going to folder " + uri);

    const currentFolders = vscode.workspace.workspaceFolders;
    // currentFolders[0] is the current workspace root.
    if (currentFolders != null && currentFolders[0] != null && currentFolders[0].uri.fsPath === uri.fsPath) {
        console.log("Selected folder is already workspace root");
        vscode.window.showWarningMessage("The selected folder is already your workspace root.");
    }
    else {
        // TODO open in new window should be a settable preference
        const inNewWindow: Boolean = false;
        console.log(`Opening folder, inNewWindow=${inNewWindow}`);
        vscode.commands.executeCommand("vscode.openFolder", uri, inNewWindow);
    }
}