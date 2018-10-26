import { Uri } from "vscode";

import Project from "./Project";
import * as Icons from "../../constants/Icons";
import { Logger } from "../../Logger";

export const REFRESH_MSG: string = "refresh";
export const TOGGLE_AUTOBUILD_MSG: string = "toggleAutoBuild";
export const OPEN_MSG: string = "open";

export enum Openable {
    WEB = "web", FILE = "file", FOLDER = "folder"
};

export function generateHtml(project: Project): string {

    const emptyRow =
    `
    <tr>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
    </tr>
    `;

    return `
        <!DOCTYPE html>

        <html>
        <head>
            <meta charset="UTF-8">
            <!--meta http-equiv="Content-Security-Policy" content="default-src 'none';"-->
            <meta name="viewport" content="width=device-width, initial-scale=1.0">

            <link rel="stylesheet" href="${getStylesheetPath()}"/>
        </head>
        <body>
        <div id="top-section">
            <h2>Project ${project.name}</h2>
            <img id="mc-icon" src="${getMCIconPath()}"/>
        </div>
        <table>
            <!--${buildRow("Name", project.name)}-->
            ${buildRow("Type", project.type.toString())}
            <!--${buildRow("Microclimate URL", project.connection.toString())}-->
            ${buildRow("Container ID", getNonNull(project.containerID, "Not available", 32))}
            ${buildRow("Project ID", project.id)}
            ${buildRow("Path on Disk", project.localPath.fsPath, Openable.FOLDER)}
            <tr>
                <td class="info-label">Auto build:</td>
                <td>
                    <input id="auto-build-toggle" type="checkbox" class="btn"
                        onclick="toggleAutoBuild(this)"
                        ${project.autoBuildEnabled ? "checked" : ""}
                    />
                </td>
            </tr>
            ${emptyRow}
            ${buildRow("Application URL", getNonNull(project.appBaseUrl, "Not Running"), (project.appBaseUrl != null ? Openable.WEB : undefined))}
            ${buildRow("Application Port", getNonNull(project.appPort, "Not Running"))}
            ${buildRow("Debug Port", getNonNull(project.debugPort, "Not Debugging"))}
        </table>

        <input id="refresh-btn" type="button" onclick="refresh()" class="btn" value="Refresh" accesskey="r"/></input>

        <script type="text/javascript">
            const vscode = acquireVsCodeApi();

            function refresh() {
                sendMsg("${REFRESH_MSG}");
            }

            function toggleAutoBuild(toggleAutoBuildBtn) {
                sendMsg("${TOGGLE_AUTOBUILD_MSG}");
            }

            function vscOpen(element, type) {
                sendMsg("${OPEN_MSG}", { type: type, value: element.textContent });
            }

            function sendMsg(msg, data) {
                vscode.postMessage({ msg: msg, data: data });
            }
        </script>

        </body>
        </html>
    `;
}

const resourceScheme = "vscode-resource:";

function getStylesheetPath(): string {
    return resourceScheme + Icons.getCss("project-info.css");
}

function getMCIconPath(): string {
    const mcIconPath: string =  resourceScheme + Icons.getIconPaths(Icons.Icons.Microclimate).dark;
    // Logger.log("MCIP", mcIconPath);
    return mcIconPath;
}

function buildRow(label: string, data: string, openable?: Openable): string {
    let td: string;
    if (openable != null) {
        td = `
            <td>
                <a onclick="vscOpen(this, '${openable}')">${data}</a>
            </td>
            `;
    }
    else {
        td = `<td>${data}</td>`;
    }
    // console.log("The td is ", td);

    return `
        <tr class="info-row">
            <td class="info-label">${label}:</td>
            ${td}
        </tr>
    `;
}

function getNonNull(item: Uri | number | string | undefined, fallback: string, maxLength?: number): string {
    let result: string;
    if (item == null) {
        result = fallback;
    }
    else if (item instanceof Uri && item.scheme.includes("file")) {
        result = item.fsPath;
    }
    else {
        result = item.toString();
    }

    if (maxLength != null) {
        result = result.substring(0, maxLength);
    }

    return result;
}