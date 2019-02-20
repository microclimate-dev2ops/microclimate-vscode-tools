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

import { Uri } from "vscode";
// import * as request from "request-promise-native";
import * as reqErrors from "request-promise-native/errors";

import Log from "../../Logger";
import Endpoints from "../../constants/Endpoints";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Connection from "./Connection";
import Requester from "../project/Requester";

const STRING_NS = StringNamespaces.CMD_NEW_CONNECTION;

namespace MCEnvironment {
    // ENV types are inferred from https://github.ibm.com/dev-ex/microclimate/blob/master/docker/portal/server.js

    export interface IMCEnvData {
        editor_url: string;
        microclimate_version: string;
        os_platform: string;
        running_on_icp: boolean;
    }

    export interface IMCEnvDataICP extends IMCEnvData {
        devops_available: boolean;

        // always true
        // running_on_icp: boolean;
        socket_namespace: string;
        user_string: string;
    }

    export interface IMCEnvDataLocal extends IMCEnvData {
        // always false on local
        // devops_available: boolean;

        // always false
        // running_on_icp: boolean;

        // socket_namespace: string;
        user_string: string;
        workspace_location: string;
    }

    /**
     *
     */
    export async function getEnvData(mcUri: Uri): Promise<IMCEnvData> {
        const envUri: Uri = mcUri.with({ path: Endpoints.ENVIRONMENT });
        const connectTimeout = 5000;

        const notMicroclimateMsg = `Microclimate API was not found - Verify that ${mcUri} resolves to a valid Microclimate instance.`;

        try {
            const response = await Requester.get(envUri, { json: true, timeout: connectTimeout });
            Log.d("Status from ENV endpoint is", response.statusCode);

            Log.d("ENV body is", response.body);
            const asMCData = response.body as MCEnvironment.IMCEnvData;
            if (asMCData == null || asMCData.microclimate_version == null) {
                throw new Error(notMicroclimateMsg);
            }
            return asMCData;
        }
        catch (err) {
            Log.i(`Connection ENV Request fail - ${err}`);

            if (err instanceof reqErrors.RequestError) {
                throw new Error(Translator.t(STRING_NS, "connectFailed", { uri: mcUri }));
            }
            else if (err instanceof reqErrors.StatusCodeError) {
                if (err.statusCode === 404) {
                    throw new Error(notMicroclimateMsg);
                }
            }
            throw err;
        }
    }

    // microclimate_version and workspace_location were both added in Microclimate 18.09
    // Portal Restart API improvement was added in 18.11
    const REQUIRED_YEAR = 18;
    const REQUIRED_MONTH = 12;
    const REQUIRED_VERSION: number = 1812;
    export const REQUIRED_VERSION_STR: string = `${REQUIRED_YEAR}.${REQUIRED_MONTH}`;     // non-nls

    const INTERNAL_BUILD_RX: RegExp = /^\d{4}_M\d{1,2}_[EI]/;

    /**
     * Parses a version number out of the given env data. If it's a development build, returns Number.MAX_SAFE_INTEGER.
     *
     * **Throws an error** if the version is not supported.
     */
    export function getVersionNumber(uri: string, envData: IMCEnvData): number {
        let rawVersion = envData.microclimate_version;

        // if the version is like "18.12" instead of "1812", strip out the "."
        if (rawVersion.match(/\d+\.\d+/)) {
            rawVersion = rawVersion.replace(".", "");
        }

        if (rawVersion === "latest") {      // non-nls
            // This means it's being hosted by an internal MC dev.
            // There's nothing we can do here but assume they have all the features we need.
            Log.i("Dev version of Microclimate");
            return Number.MAX_SAFE_INTEGER;
        }
        else if (rawVersion.match(INTERNAL_BUILD_RX) != null) {
            // To make this readable, will put the expected values of each variable when rawVersion="2018_M24_E"
            Log.i("Internal build of Microclimate " + rawVersion);

            const year = Number(rawVersion.substring(2, 4));                                            // 18
            const iterationStartIndex = rawVersion.indexOf("_", 4) + 2;                                 // +2 for "_M" -> 5
            const iterationEndIndex = rawVersion.indexOf("_", 6);                                       // 8
            const iteration = Number(rawVersion.substring(iterationStartIndex, iterationEndIndex));     // 24
            const month = iteration / 2;                                                                // 12

            if (!Number.isInteger(year) || !Number.isInteger(iteration) || !Number.isInteger(month)) {
                // Fail loudly because this is internal only
                throw new Error(`Error parsing version from development build ${rawVersion},` +
                    `year="${year}" iteration="${iteration}" month="${month}"`);
            }
            else {
                // Now we can put the version in the normal YYMM form and work from there
                rawVersion = `${year}${month}`;
            }
        }

        Log.d("rawVersion=" + rawVersion);

        const versionNum = Number(rawVersion);
        if (isNaN(versionNum)) {
            Log.e("Couldn't convert provided version to Number, version is: " + rawVersion);
            throw new Error(Translator.t(STRING_NS, "versionNotRecognized",
                { connectionUri: uri, rawVersion: rawVersion, requiredVersion: REQUIRED_VERSION_STR})
            );
        }
        else if (versionNum < REQUIRED_VERSION) {
            Log.e(`Microclimate version ${versionNum} is too old.`);
            throw new Error(Translator.t(STRING_NS, "versionTooOld",
                { connectionUri: uri, rawVersion: rawVersion, requiredVersion: REQUIRED_VERSION_STR})
            );
        }
        return versionNum;

    }

    export function getVersionAsString(versionNum: number): string {
        if (versionNum === Number.MAX_SAFE_INTEGER) {
            return "latest";
        }
        else {
            const year = Math.floor(versionNum / 100);
            const month = versionNum % 100;
            return `${year}.${month < 10 ? "0" + month : month}`;
        }
    }

    /**
     * @returns If the given Connection matches the given environment data for fields the tools are interested in.
     */
    export function envMatchesLocal(connection: Connection, envData: IMCEnvDataLocal): boolean {
        let newVersionNumber;
        try {
            // the user will see the "version bad/too old" message after the ConnectionManager tries to reconnect to this instance.
            newVersionNumber = getVersionNumber(connection.mcUrl.toString(), envData);
        }
        catch (err) {
            Log.w(err);
            return false;
        }

        return connection.version === newVersionNumber;
            // should check workspace too, but need to consider platform when comparing paths
            // more to check once we support ICP
            // envData.user_string
    }

    /**
     * @returns If the given Connection matches the given environment data for fields the tools are interested in.
     */
    export function envMatchesICP(_connection: Connection, _envData: IMCEnvDataICP): boolean {
        // TODO
        return true;

        /*
        let newVersionNumber;
        try {
            // the user will see the "version bad/too old" message after the ConnectionManager tries to reconnect to this instance.
            newVersionNumber = getVersionNumber(connection.mcUri.toString(), envData);
        }
        catch (err) {
            Log.w(err);
            return false;
        }

        // return connection.version === newVersionNumber &&
            // connection.user === envData.socket_namespace;

            // connection.workspacePath.fsPath === envData.workspace_location;
            */
    }
}

export default MCEnvironment;
