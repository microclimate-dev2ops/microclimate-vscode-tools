/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";
import * as path from "path";
import * as request from "request-promise-native";

import * as MCUtil from "../../MCUtil";
import Log from "../../Logger";
import Connection from "./Connection";
import EndpointUtil, { MCEndpoints } from "../../constants/Endpoints";

export interface IMCTemplateData {
    label: string;
    description: string;
    extension?: string;
    language: string;
}

export interface IProjectCreationResponse {
    // status: string;
    projectName: string;
    // projectID: string;
    locOnDisk: string;
}

/**
 * Functions to create or import new user projects into Microclimate
 */
namespace UserProjectCreator {

    export async function createProject(connection: Connection)
        : Promise<{ template: IMCTemplateData, fullUserDir: string, projectName: string } | undefined> {

    // export async function createProject(connection: Connection): Promise<IProjectCreationResponse | undefined> {
        const templateSelected = await promptForTemplate(connection);
        if (templateSelected == null) {
            return;
        }

        const projectName = await promptForProjectName(templateSelected);
        if (projectName == null) {
            return;
        }

        const targetDirUri = await promptForDir(true);
        if (targetDirUri == null) {
            return;
        }
        // abs path on user system
        const userTargetPath = targetDirUri.fsPath;

        // caller must handle errors
        const creationRes: IProjectCreationResponse = await issueCreateReq(connection, templateSelected, projectName, userTargetPath);

        const fullUserDir = MCUtil.appendPathWithoutDupe(userTargetPath, creationRes.locOnDisk);
        return { template: templateSelected, fullUserDir, projectName, };
    }

    export async function bindProject(connection: Connection): Promise<IProjectCreationResponse | undefined> {
        const dirToBindUri = await promptForDir(false);
        if (dirToBindUri == null) {
            return;
        }
        const dirToBind = dirToBindUri.fsPath;
        Log.i("dirToBind", dirToBind);

        // here we should be doing /initialize instead
        const template = await promptForTemplate(connection);
        if (template == null) {
            return;
        }
        const projectName = path.basename(dirToBind);

        const bindRes = issueBindReq(connection, projectName, dirToBind, template);

        Log.d("Bind response", bindRes);
        return bindRes;
    }

    async function promptForDir(isCreate: boolean): Promise<vscode.Uri | undefined> {
        let btn: string;
        let defaultUri: vscode.Uri | undefined;
        if (isCreate) {
            btn = "Create";
        }
        else {
            btn = "Bind";
        }
        if (vscode.workspace.workspaceFolders != null) {
            defaultUri = vscode.workspace.workspaceFolders[0].uri;
        }

        const selectedDirs = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: btn,
            defaultUri
        });
        if (selectedDirs == null) {
            return;
        }
        // canSelectMany is false
        return selectedDirs[0];
    }

    async function promptForTemplate(connection: Connection): Promise<IMCTemplateData | undefined> {
        const templatesUrl = EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.TEMPLATES);
        const templates: IMCTemplateData[] = await request.get(templatesUrl, { json: true });

        const projectTypeQpis: Array<(vscode.QuickPickItem & IMCTemplateData)> = templates.map((type) => {
            return {
                label: type.label,
                description: type.description,
                // detail: type.extension,
                detail: type.language,
                language: type.language,
                extension: type.extension,
            };
        });

        return await vscode.window.showQuickPick(projectTypeQpis, {
            placeHolder: "Select the project type to create",
            // matchOnDescription: true,
            matchOnDetail: true,
        });
    }

    export async function issueCreateReq(
        connection: Connection, projectTypeSelected: IMCTemplateData, projectName: string, projectLocation: string)
        : Promise<IProjectCreationResponse> {

        const payload = {
            language: projectTypeSelected.language,
            name: projectName,
            id: projectTypeSelected.extension,    // note: null for nodejs right now
            path: projectLocation,
        };

        const creationRes = await request.post(EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.CREATE_FROM_TEMPLATE), {
            json: true,
            body: payload,
        });

        Log.i("Creation response", creationRes);
        return creationRes;
    }

    export async function issueBindReq(connection: Connection, projectName: string, dirToBind: string, template: IMCTemplateData)
        : Promise<IProjectCreationResponse | undefined> {

        const bindEndpoint = EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.BIND);
        const bindRes = request.post(bindEndpoint, {
            json: true,
            body: {
                name: projectName,
                language: template.language,
                buildtype: determineBuildType(template),
                path: dirToBind,
            }
        });
        Log.d("Bind response", bindRes);
        return bindRes;
    }

    async function promptForProjectName(template: IMCTemplateData): Promise<OptionalString> {
        return await vscode.window.showInputBox({
            placeHolder: `Enter a name for your new ${template.description} project`,
            validateInput: validateProjectName,
        });
    }

    function validateProjectName(projectName: string): OptionalString {
        const matches: boolean = /^[a-z0-9]+$/.test(projectName);
        if (!matches) {
            return `Invalid project name "${projectName}". Project name can only contain numbers and lowercase letters.`;
        }
        return undefined;
    }

    // delet this
    function determineBuildType(template: IMCTemplateData): OptionalString {
        if (template.extension === "springJavaTemplate") {
            return "spring";
        }
        else if (template.extension === "javaMicroProfileTemplate") {
            return "liberty";
        }
        return undefined;
    }
}

export default UserProjectCreator;
