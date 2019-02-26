import * as vscode from "vscode";

import Connection from "./Connection";

/**
 * Represents the data we have to store about a connection in order to re-create it without having to contact the server again.
 * Storing all this data allows us to keep connections and show them in the tree even if we can't contact them - though they won't function.
 */
export interface IConnectionData {
    readonly socketNamespace: string;
    readonly user: string;
    readonly url: vscode.Uri;
    readonly version: number;
    readonly workspacePath: string;
}

/**
 * Same as IConnectionData but the URL is a string. See explanation above.
 */
export interface ISaveableConnectionData {
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
        return {
            socketNamespace: data.socketNamespace,
            urlString: data.url.toString(),
            user: data.user,
            version: data.version,
            workspacePath: data.workspacePath,
        };
    }

    export function getConnectionData(connection: Connection): IConnectionData {
        return {
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
