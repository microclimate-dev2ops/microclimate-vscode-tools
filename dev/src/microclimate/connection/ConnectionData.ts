import * as vscode from "vscode";

import Connection from "./Connection";

// These interfaces represent the data we have to store about a connection in order to re-create it without having to contact the server again.
// Storing all this data allows us to keep connections even if we can't contact them - though they won't function.
// Previously a connection would be deleted on VS Code reload or connection refresh
// if the Microclimate instance couldn't be contacted, which was very annoying.

export interface IConnectionData {
    readonly url: vscode.Uri;
    readonly version: number;
    readonly workspacePath: string;
    readonly user: string;
}

export interface ISaveableConnectionData {
    // has to be a string - not a URI - because otherwise uri.toString() will return [object Object] after loading
    // so we have to store it as a string, and then parse it back to a URI so that the URI functions are available.
    readonly urlString: string;
    readonly version: number;
    readonly workspacePath: string;
    readonly user: string;
}

namespace ConnectionData {
    export function convertToSaveable(data: IConnectionData): ISaveableConnectionData {
        return {
            urlString: data.url.toString(),
            user: data.user,
            version: data.version,
            workspacePath: data.workspacePath,
        };
    }

    export function getConnectionData(connection: Connection): IConnectionData {
        return {
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
