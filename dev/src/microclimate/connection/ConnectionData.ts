import * as vscode from "vscode";

import { Connection } from "./ConnectionExporter";

/**
 * Represents the data we have to store about a connection in order to re-create it without having to contact the server again.
 * Storing all this data allows us to keep connections and show them in the tree even if we can't contact them - though they won't function.
 */
export interface IConnectionData {
    // not set for local
    readonly kubeNamespace?: string;
    readonly socketNamespace: string;
    readonly user: string;
    readonly url: vscode.Uri;
    readonly version: number;
    readonly workspacePath: string;
}

/**
 * Same as IConnectionData but the URL is a string.
 */
export interface ISaveableConnectionData {
    readonly kubeNamespace?: string;
    readonly socketNamespace: string;
    readonly user: string;
    // has to be a string - not a URI - because otherwise uri.toString() will return [object Object] after loading
    // so we have to store it as a string, and then parse it back to a URI so that the URI functions are available.
    readonly urlString: string;
    readonly version: number;
    readonly workspacePath: string;
}

namespace ConnectionData {
    export function convertToSaveable(data: IConnectionData): ISaveableConnectionData {
        const url = data.url;
        const result = data;
        delete (result as any).url;
        return Object.assign(result, { urlString: url.toString() });
    }

    export function convertFromSaveable(data: ISaveableConnectionData): IConnectionData {
        return {
            kubeNamespace: data.kubeNamespace,
            socketNamespace: data.socketNamespace,
            user: data.user,
            url: vscode.Uri.parse(data.urlString),
            version: data.version,
            workspacePath: data.workspacePath,
        };
    }

    export function getConnectionData(connection: Connection): IConnectionData {
        return {
            kubeNamespace: (connection as any).kubeNamespace,
            socketNamespace: connection.socketNamespace,
            url: connection.mcUrl,
            version: connection.version,
            user: connection.user,
            workspacePath: connection.workspacePath.fsPath,
        };
    }
}

export {
    ConnectionData
};
