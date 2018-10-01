import * as vscode from "vscode";

import Project from "../microclimate/project/Project";
import Connection from "../microclimate/connection/Connection";

export default async function openInBrowserCmd(resource: Project | Connection): Promise<void> {
    if (resource == null) {
        // this means it was invoked from the command palette, not from the TreeItem
        // some extra work to support this - need user to enter project name, 
        // then find the ONE project that matches that name - See ConnectionManager.getProjectByName
        // TODO Getting the Project in this way could apply to many commands.
        vscode.window.showErrorMessage("Not implemented - Use the Project Tree context menu");
        return;
    }

    let uriToOpen;
    // This will open the project in the external web browser.
    // We can look into giving the option to open it inside the IDE using a WebView, 
    // but this will be considerably more work and less performant.
    if (resource instanceof Project) {
        const project: Project = resource as Project;
        if (!project.isStarted) {
            vscode.window.showErrorMessage("You can only open projects that are Started");
            return;
        }
        uriToOpen = project.appBaseUrl;
    }
    else {
        // it's a Connection
        const conn: Connection = resource as Connection;
        uriToOpen = conn.mcUri;
    }

    vscode.window.showInformationMessage("Opening " + uriToOpen);
    vscode.commands.executeCommand("vscode.open", uriToOpen);
}