/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import Project from "./Project";
import Resources from "../../constants/Resources";
import * as MCUtil from "../../MCUtil";

// This file does have a bunch of strings that should be translated,
// but the stringfinder is not smart enough to pick them out from the regular html strings. So, do this file by hand.
// non-nls-file

/**
 * These are the messages the WebView can send back to its creator in ProjectInfoCmd
 */
export enum Messages {
    BUILD = "build",
    TOGGLE_AUTOBUILD = "toggleAutoBuild",
    OPEN = "open",
    DELETE = "delete",
    TOGGLE_ENABLEMENT = "toggleEnablement"
}

const resourceScheme = "vscode-resource:";

export enum Openable {
    WEB = "web", FILE = "file", FOLDER = "folder"
}

export function refreshProjectOverview(webviewPanel: vscode.WebviewPanel, project: Project): void {
    webviewPanel.webview.html = generateHtml(project);
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
                <input id="build-btn" type="button" value="Build"
                    onclick="${project.state.isEnabled ? `sendMsg('${Messages.BUILD}')` : ""}"
                    class="btn ${project.state.isEnabled ? "" : "btn-disabled"}"/>
            </div>

            <table id="project-info-table">
                <!--${buildRow("Name", project.name)}-->
                ${buildRow("Type", project.type.toString())}
                <!--${buildRow("Microclimate URL", project.connection.toString())}-->
                ${buildRow("Project ID", project.id)}
                ${buildRow("Container ID", getNonNull(project.containerID, "Not available", 32))}
                ${buildRow("Location on Disk", project.localPath.fsPath, Openable.FOLDER)}
                <tr>
                    <td class="info-label">Auto build:</td>
                    <td>
                        <input id="auto-build-toggle" type="checkbox" class="btn"
                            onclick="sendMsg('${Messages.TOGGLE_AUTOBUILD}')"
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
                ${project.hasContextRoot ? buildRow("Context Root", "/" + project.contextRoot) : ""}
                ${buildRow("Application URL", getNonNull(project.appBaseUrl, "Not running"), (project.appBaseUrl != null ? Openable.WEB : undefined))}
                ${buildRow("Application Port", getNonNull(project.appPort, "Not running"))}
                ${buildRow("Debug Port", getNonNull(project.debugPort, "Not debugging"))}
                ${buildRow("Debug URL", getNonNull(project.debugUrl, "Not debugging"))}
            </table>

            <div id="bottom-section">
                <input id="delete-btn"  type="button" onclick="sendMsg('${Messages.DELETE}')" class="btn" value="Delete project"/>
                <input id="enablement-btn" type="button" onclick="sendMsg('${Messages.TOGGLE_ENABLEMENT}')" class="btn"
                    value="${(project.state.isEnabled ? "Disable" : "Enable") + " project"}"/>
            </div>
        </div>

        <script type="text/javascript">
            const vscode = acquireVsCodeApi();

            function vscOpen(element, type) {
                sendMsg("${Messages.OPEN}", { type: type, value: element.textContent });
            }

            function sendMsg(type, data = undefined) {
                vscode.postMessage({ type: type, data: data });
            }
        </script>

        </body>
        </html>
    `;
}

function getStylesheetPath(): string {
    return resourceScheme + Resources.getCss("project-overview.css");
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

function getNonNull(item: vscode.Uri | number | string | undefined, fallback: string, maxLength?: number): string {
    let result: string;
    if (item == null || item === "") {
        result = fallback;
    }
    else if (item instanceof vscode.Uri && (item as vscode.Uri).scheme.includes("file")) {
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
