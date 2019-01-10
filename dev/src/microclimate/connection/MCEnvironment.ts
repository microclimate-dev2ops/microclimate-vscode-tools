import { Uri } from "vscode";
import * as request from "request-promise-native";
import * as reqErrors from "request-promise-native/errors";

import Log from "../../Logger";
import Endpoints from "../../constants/Endpoints";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Connection from "./Connection";

const STRING_NS = StringNamespaces.CMD_NEW_CONNECTION;

namespace MCEnvironment {

    // From https://github.ibm.com/dev-ex/microclimate/blob/master/docker/portal/server.js#L229
    export interface IMCEnvData {
        devops_available: boolean;
        editor_url: string;
        microclimate_version: string;
        running_on_icp: boolean;
        socket_namespace?: string;
        user_string?: string;
        workspace_location: string;
    }

    export async function getEnvData(mcUri: Uri): Promise<IMCEnvData> {
        const envUri: Uri = mcUri.with({ path: Endpoints.ENVIRONMENT });
        const connectTimeout = 2500;

        try {
            const result = await request.get(envUri.toString(), { json: true, timeout: connectTimeout });
            return result;
        }
        catch (err) {
            Log.i(`Connection ENV Request fail - ${err}`);
            if (err instanceof reqErrors.RequestError) {
                throw new Error(Translator.t(STRING_NS, "connectFailed", { uri: mcUri }));
            }
            throw err;
        }
    }

    // microclimate_version and workspace_location were both added in Microclimate 18.09
    // Portal Restart API improvement was added in 18.11
    export const REQUIRED_VERSION_STR: string = "18.12";     // non-nls
    const REQUIRED_VERSION: number = 1812;
    const INTERNAL_BUILD_RX: RegExp = /^\d{4}_M\d+_[EI]/;

    /**
     * Parses a version number out of the given env data. If it's a development build, returns Number.MAX_SAFE_INTEGER.
     *
     * **Throws an error** if the version is not supported.
     */
    export function getVersionNumber(envData: IMCEnvData): number {
        const rawVersion = envData.microclimate_version;

        if (rawVersion === "latest") {      // non-nls
            // This means it's being hosted by an internal MC dev.
            // There's nothing we can do here but assume they have all the features we need.
            Log.i("Dev version of Microclimate");
            return Number.MAX_SAFE_INTEGER;
        }
        else if (rawVersion.match(INTERNAL_BUILD_RX) != null) {
            Log.i("Internal build of Microclimate");
            return Number.MAX_SAFE_INTEGER;
        }
        else {
            const versionNum = Number(rawVersion);
            if (isNaN(versionNum)) {
                Log.e("Couldn't convert provided version to Number, version is: " + rawVersion);
                throw new Error(Translator.t(STRING_NS, "versionNotRecognized", { rawVersion: rawVersion, requiredVersion: REQUIRED_VERSION_STR}));
            }
            else if (versionNum < REQUIRED_VERSION) {
                Log.e(`Microclimate version ${versionNum} is too old.`);
                throw new Error(Translator.t(STRING_NS, "versionTooOld", { rawVersion: rawVersion, requiredVersion: REQUIRED_VERSION_STR}));
            }
            return versionNum;
        }
    }

    export function getVersionAsString(versionNum: number): string {
        if (versionNum === Number.MAX_SAFE_INTEGER) {
            return "latest";
        }
        else {
            const year = Math.floor(versionNum / 100);
            const month = versionNum % 100;
            return `${year}.${month}`;
        }
    }

    /**
     * @returns If the given Connection matches the given environment data for fields the tools are interested in.
     */
    export function envMatches(connection: Connection, envData: IMCEnvData): boolean {
        let newVersionNumber;
        try {
            newVersionNumber = getVersionNumber(envData);
        }
        catch (err) {
            Log.w(err);
            return false;
        }

        return connection.version === newVersionNumber &&
            connection.workspacePath.fsPath === envData.workspace_location;
            // more to check once we support ICP
            // envData.user_string
    }
}

export default MCEnvironment;
