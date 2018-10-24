import { Uri } from "vscode";

import Project from "./Project";
import toggleAutoBuildCmd, { TOGGLE_AUTOBUILD_CMD_ID } from "../../command/ToggleAutoBuildCmd";

export default function projectInfoHtml(project: Project): string {

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
            <style>
                tr {
                    padding-bottom: 3px;
                }
                td {
                }
                /*
                tr:nth-child(odd) {
                    background-color: #333;
                }*/
                .info-label {
                    font-weight: bold;
                    padding-right: 10px;
                }
            </style>
        </head>
        <body>
            <h2>Project ${project.name}</h2>
            <table>
            <!--${buildRow("Name", project.name)}-->
            ${buildRow("Type", project.type.toString())}
            <!--${buildRow("Microclimate URL", project.connection.toString())}-->
            ${buildRow("Container ID", getNonNull(project.containerID, "Not available", 16))}
            ${buildRow("Project ID", project.id)}
            ${buildRow("Path on Disk", project.localPath.fsPath)}
            <tr>
                <td>Auto build</td>
                <td>${project.autoBuildEnabled ? "On": "Off"}
                    -
                    <a href="command:${TOGGLE_AUTOBUILD_CMD_ID}" class="monaco-button monaco-text-button"
                        tabindex="0" role="button">
                        Toggle</a>
                </td>
            </tr>
            ${emptyRow}
            ${buildRow("Application URL", getNonNull(project.appBaseUrl, "Not Running"))}
            ${buildRow("Application Port", getNonNull(project.appPort, "Not Running"))}
            ${buildRow("Debug Port", getNonNull(project.debugPort, "Not Debugging"))}
            </table>
        </body>
        </html>
    `;
}

function buildRow(label: string, data: string): string {
    return `
        <tr class="info-row">
            <td class="info-label">${label}:</td>
            <td>${data}</td>
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