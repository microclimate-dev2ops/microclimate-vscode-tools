import * as vscode from "vscode";

import Project from "microclimate/project/Project";
import Connection from "microclimate/connection/Connection";
import { promptForResource } from "command/CommandUtil";
import { ProjectState } from "microclimate/project/ProjectState";

export default async function openInBrowserCmd(resource: Project | Connection): Promise<void> {
    console.log("OpenInBrowserCmd invoked");
    if (resource == null) {
        const selected = await promptForResource(ProjectState.AppStates.STARTED);
        if (selected == null) {
            console.log("User cancelled prompt for resource");
            // user cancelled
            return;
        }
        resource = selected;
    }

    let uriToOpen;
    // This will open the project or Microclimate in the external web browser.
    // We can look into giving the option to open it inside the IDE using a WebView,
    // but this will be considerably more work and less performant.
    if (resource instanceof Project) {
        const project: Project = resource as Project;
        if (!project.state.isStarted) {
            vscode.window.showErrorMessage("You can only open projects that are Started");
            return;
        }
        uriToOpen = project.appBaseUrl;
    }
    else if (resource instanceof Connection) {
        const conn: Connection = resource as Connection;
        uriToOpen = conn.mcUri;
    }
    else {
        // shouldn't happen
        vscode.window.showErrorMessage(`Don't know how to open object of type ${typeof(resource)} in browser`);
        return;
    }

    // vscode.window.showInformationMessage("Opening " + uriToOpen);
    vscode.commands.executeCommand("vscode.open", uriToOpen);
}