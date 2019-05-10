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
import * as request from "request-promise-native";

import Log from "../../Logger";
import Connection from "./Connection";
import EndpointUtil, { MCEndpoints } from "../../constants/Endpoints";

export interface IMCProjectType {
    label: string;
    description: string;
    extension: string;
    language: string;
}

/**
 * Functions to create or import new user projects into Codewind
 */
namespace ProjectCreator {

    export async function createProject(connection: Connection): Promise<void> {
        const projectTypesUrl = EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.PROJECT_TYPES);
        const projectTypes: IMCProjectType[] = await request.get(projectTypesUrl, { json: true });

        const projectTypeQpis: Array<(vscode.QuickPickItem & IMCProjectType)> = projectTypes.map((type) => {
            return {
                ...type,
                detail: type.language,
                extension: type.extension,
            };
        });

        const projectTypeSelected = await vscode.window.showQuickPick(projectTypeQpis, {
            placeHolder: "Select the project type to create",
            // matchOnDescription: true,
            matchOnDetail: true,
        });

        if (projectTypeSelected == null) {
            return;
        }

        const projectName = await getProjectName(projectTypeSelected.description);

        if (projectName == null) {
            return;
        }

        return issueCreateReq(connection, projectTypeSelected, projectName);
    }

    export async function issueCreateReq(connection: Connection, projectTypeSelected: IMCProjectType, projectName: string): Promise<void> {
        const payload = {
            language: projectTypeSelected.language,
            name: projectName,
            extension: projectTypeSelected.extension
        };

        const creationRes = await request.post(EndpointUtil.resolveMCEndpoint(connection, MCEndpoints.PROJECTS), {
            json: true,
            body: payload,
        });

        Log.i(creationRes);
        vscode.window.showInformationMessage(`Creating ${payload.language} project ${projectName}`);
    }

    async function getProjectName(projectTypeName?: string): Promise<string | undefined> {
        return await vscode.window.showInputBox({
            placeHolder: `Enter a name for your new ${projectTypeName ? projectTypeName + " " : ""}project`,
            validateInput: (input: string): OptionalString => {
                const matches: boolean = /^[a-z0-9]+$/.test(input);
                if (!matches) {
                    return `Invalid project name "${input}". Project name can only contain numbers and lowercase letters.`;
                }
                return undefined;
            }
        });
    }
}

export default ProjectCreator;
