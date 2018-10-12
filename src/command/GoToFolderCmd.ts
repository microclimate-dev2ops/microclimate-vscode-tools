import * as vscode from "vscode";

import Project from "microclimate/project/Project";
import Connection from "microclimate/connection/Connection";

export default async function goToFolder(resource: Project | Connection) {
    console.log("Go to folder command invoked");
    let uri;
    if (resource instanceof Project) {
        uri = resource.localPath;
    }
    else if (resource instanceof Connection) {
        uri = resource.workspacePath;
    }

    if (!uri) {
        console.error("Error getting uri from object", resource);
        return;
    }
    console.log("Going to folder " + uri);

    // TODO open in new window should be a settable preference
    vscode.commands.executeCommand("vscode.openFolder", uri, false);

}