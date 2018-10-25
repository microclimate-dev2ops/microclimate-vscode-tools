import { Uri } from "vscode";

import Project from "./Project";
import toggleAutoBuildCmd, { TOGGLE_AUTOBUILD_CMD_ID } from "../../command/ToggleAutoBuildCmd";

export const REFRESH_MSG: string = "refresh";
export const TOGGLE_AUTOBUILD_MSG: string = "toggleAutoBuild";

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

            <style>
                tr {
                    padding-bottom: 3px;
                }
                td {
                }
                .button {
                        padding-left: .5rem;
                        padding-right: .5rem;
                        background: var(--vscode-editor-foreground);
                        border: none;
                        border-radius: 4px;
                        margin: 4px;
                }
                .info-label {
                    font-weight: bold;
                    padding-right: 10px;
                }
            </style>
        </head>
        <body>
            <h2>Project ${project.name}</h2>
            <input type="button" onclick="refresh()" class="button" value="Refresh" accesskey="r"/></input>
            <p id="time"></p>
            <table>
                <!--${buildRow("Name", project.name)}-->
                ${buildRow("Type", project.type.toString())}
                <!--${buildRow("Microclimate URL", project.connection.toString())}-->
                ${buildRow("Container ID", getNonNull(project.containerID, "Not available", 16))}
                ${buildRow("Project ID", project.id)}
                ${buildRow("Path on Disk", project.localPath.fsPath)}
                <tr>
                    <td id="auto-build-label" class="info-label">Auto build</td>
                    <td>${project.autoBuildEnabled ? "On": "Off"}
                        -
                        <input id="auto-build-toggle" type="button" onclick="toggleAutoBuild(this)" class="button" value="Toggle"/>
                    </td>
                </tr>
                ${emptyRow}
                ${buildRow("Application URL", getNonNull(project.appBaseUrl, "Not Running"))}
                ${buildRow("Application Port", getNonNull(project.appPort, "Not Running"))}
                ${buildRow("Debug Port", getNonNull(project.debugPort, "Not Debugging"))}
            </table>

            <script type="text/javascript">
                const vscode = acquireVsCodeApi();

                function refresh() {
                    vscode.postMessage("${REFRESH_MSG}");
                }

                function toggleAutoBuild(toggleAutoBuildBtn) {
                    vscode.postMessage("${TOGGLE_AUTOBUILD_MSG}");

                    setAutoBuildAction();

                    setTimeout(refresh, 500);
                }

                function setAutoBuildAction() {
                    const autoBuild = document.getElementById("auto-build-label");
                    const autoBuildEnabled = autoBuild.textContent.includes("On");

                    const autoBuildBtn = document.getElementById("auto-build-toggle");
                    autoBuildBtn.textContent = autoBuildEnabled ? "Disable" : "Enable";
                }

                setAutoBuildAction();

            </script>
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