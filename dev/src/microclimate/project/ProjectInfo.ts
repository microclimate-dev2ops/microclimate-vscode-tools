import { Uri } from "vscode";

import Project from "./Project";
import * as Resources from "../../constants/Resources";
import * as MCUtil from "../../MCUtil";

export const REFRESH_MSG: string = "refresh";
export const TOGGLE_AUTOBUILD_MSG: string = "toggleAutoBuild";
export const OPEN_MSG: string = "open";
export const DELETE_MSG: string = "delete";

const resourceScheme = "vscode-resource:";

export enum Openable {
    WEB = "web", FILE = "file", FOLDER = "folder"
}

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
            <!--meta http-equiv="Content-Security-Policy" content="default-src 'self' ;"-->
            <meta name="viewport" content="width=device-width, initial-scale=1.0">

            <link rel="stylesheet" href="${getStylesheetPath()}"/>
        </head>
        <body>

        <div id="main">
            <div id="top-section">
                <img id="mc-icon" width="30px" src="${getMCIconPath()}"/>
                <h2>Project ${project.name}</h2>
                <input id="refresh-btn" type="button" onclick="sendMsg('${REFRESH_MSG}')" class="btn" value="Refresh"/>
            </div>

            <table id="project-info-table">
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
                            onclick="sendMsg('${TOGGLE_AUTOBUILD_MSG}')"
                            ${project.autoBuildEnabled ? "checked" : ""}
                            ${project.state.isEnabled ? " " : " disabled"}
                        />
                    </td>
                </tr>
                ${emptyRow}
                ${buildRow("Application Status", project.state.appState)}
                ${buildRow("Build Status", getNonNull(project.state.getBuildString(), "Not available"))}
                ${emptyRow}
                ${buildRow("Last Image Build", formatDate(project.lastImgBuild, "Not available"))}
                ${buildRow("Last Build", formatDate(project.lastBuild, "Not available"))}
                ${emptyRow}
                ${buildRow("Application URL", getNonNull(project.appBaseUrl, "Not Running"), (project.appBaseUrl != null ? Openable.WEB : undefined))}
                ${buildRow("Application Port", getNonNull(project.appPort, "Not Running"))}
                ${buildRow("Debug Port", getNonNull(project.debugPort, "Not Debugging"))}
            </table>

            <div id="bottom-section">
                <input id="delete-btn"  type="button" onclick="sendMsg('${DELETE_MSG}')" class="btn" value="Delete project"/>
            </div>
        </div>

        <script type="text/javascript">
            const vscode = acquireVsCodeApi();

            function vscOpen(element, type) {
                sendMsg("${OPEN_MSG}", { type: type, value: element.textContent });
            }

            function sendMsg(msg, data = undefined) {
                vscode.postMessage({ msg: msg, data: data });
            }
        </script>

        </body>
        </html>
    `;
}

function getStylesheetPath(): string {
    return resourceScheme + Resources.getCss("project-info.css");
}

function getMCIconPath(): string {
    const mcIconPath: string =  resourceScheme + Resources.getIconPaths(Resources.Icons.Microclimate).dark;
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
    if (item == null || item === "") {
        result = fallback;
    }
    else if (item instanceof Uri && (item as Uri).scheme.includes("file")) {
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

function formatDate(d: Date, fallback: string): string {
    if (MCUtil.isGoodDate(d)) {
        let dateStr: string = d.toLocaleDateString();
        if (dateStr === (new Date()).toLocaleDateString()) {
            dateStr = "Today";
        }

        return `${dateStr} at ${d.toLocaleTimeString()}`;
    }
    else {
        return fallback;
    }
}
