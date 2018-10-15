import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import Connection from "../microclimate/connection/Connection";

export default async function openWorkspaceFolderCmd(resource: Project | Connection) {
    console.log("Go to folder command invoked on " + resource);
    let uri;
    if (resource instanceof Project) {
        uri = resource.localPath;
    }
    else if (resource instanceof Connection) {
        uri = resource.workspacePath;
    }

    if (!uri) {
        const msg = "Error getting uri from object: " + resource;
        console.error(msg);
        vscode.window.showErrorMessage(msg);
        return;
    }
    console.log("Going to folder " + uri);

    // TODO open in new window should be a settable preference
    vscode.commands.executeCommand("vscode.openFolder", uri, false);

}