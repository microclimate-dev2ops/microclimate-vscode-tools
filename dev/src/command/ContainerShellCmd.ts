import * as vscode from "vscode";

import { ProjectState } from "../microclimate/project/ProjectState";
import { promptForProject } from "./CommandUtil";
import Project from "../microclimate/project/Project";
import { Logger } from "../Logger";

export default async function containerShellCmd(project: Project): Promise<void> {
    Logger.log("containerBashCmd invoked");
    if (project == null) {
        const selected = await promptForProject(...ProjectState.getEnabledStates());
        if (selected == null) {
            // user cancelled
            Logger.log("User cancelled project prompt");
            return;
        }
        project = selected;
    }

    if (!project.containerID) {
        vscode.window.showWarningMessage("This project does not have a container running right now. Wait until the project is Started.");
        return;
    }

    const toExec: string = "bash";
    // const env = convertNodeEnvToTerminalEnv(process.env);

    const options: vscode.TerminalOptions = {
        name: `${toExec} - ${project.name}`,

        // Passing through environment variables is not actually useful,
        // since we'll lose them once we exec into the container anyway.
        // env: env
    };

    const term: vscode.Terminal = await vscode.window.createTerminal(options);
    term.sendText(`docker exec -it ${project.containerID} /usr/bin/env ${toExec}`);
    term.show();
}

/*
async function getExistingTerminals(name: string): Promise<vscode.Terminal[] | undefined> {
    //const matchingTerms: vscode.Terminal[] = vscode.window.terminals.filter( (term) => term.name === name);
    return vscode.window.terminals.filter( (term) => term.name === name);
}*/

/*
// The format required for environment variables to be passed a vscode terminal
interface TerminalEnv {
    [key: string]: string | null;
}*/

/**
 * Convert a NodeJS.ProcessEnv to the slightly different format VSCode requires -
 * This actually only consists of replacing 'undefined' values with 'null'.
 */
/*
function convertNodeEnvToTerminalEnv(nodeEnv: NodeJS.ProcessEnv): TerminalEnv {
    // Create an empty object, then loop over the key/values of the NodeEnv.
    // If the value is not undefined, set the new k/v into the new object.
    // if it is undefined, set key=null into the new object. Then return that reconstructed object.

    return Object.keys(nodeEnv).reduce( (result: TerminalEnv, key): {} => {
        let value: string | null = nodeEnv[key] || null;
        if (value === undefined) {
            // Replace 'undefined' with 'null' because that is what TerminalOptions requires
            value = null;
        }
        result[key] = value;
        return result;
    }, {});
}*/