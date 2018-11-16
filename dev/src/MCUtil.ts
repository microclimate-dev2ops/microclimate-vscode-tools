import { Uri } from "vscode";
import * as path from "path";
// import { Log } from "./Logger";

/**
 * Append toAppend to start, removing the last segment of start if the first segment of toAppend matches it.
 *
 * appendPathWithoutDupe("/home/tim/microclimate-workspace/", "/microclimate-workspace/myproject")
 *      -> "/home/tim/microclimate-workspace/myproject"
 */
export function appendPathWithoutDupe(start: string, toAppend: string): string {
    // Remove end of start / if present
    if (start.endsWith(path.sep)) {
        start = start.substring(0, start.length);
    }

    // Remove start of toAppend / if present
    if (toAppend.startsWith(path.sep)) {
        toAppend = toAppend.substring(1, toAppend.length + 1);
    }

    const lastStartSegment = lastPathSegment(start);
    if (toAppend.startsWith(lastStartSegment)) {
        start = start.substring(0, start.length - lastStartSegment.length);
    }

    return path.join(start, toAppend);
}

/**
 * Returns the last segment of the given path, with no starting slash.
 * Trailing slash is kept if present.
 *
 * lastPathSegment("/home/tim/test/dir/") -> "dir/"
 */
export function lastPathSegment(p: string): string {
    return p.substr(p.lastIndexOf(path.sep) + 1);
}

export function uppercaseFirstChar(input: string): string {
    return input.charAt(0).toUpperCase() + input.slice(1);
}

/**
 * Returns a wrapper promise which runs the given promise with the given timeout.
 * If the timeout expires before the given promise is fulfilled, the wrapper promise rejects with the given message.
 *
 * If the promise resolves or rejects before the timeout,
 * the wrapper promise resolves or rejects with the same result as the inner promise.
 */
export function promiseWithTimeout<T>(promise: Promise<T>, timeoutMS: number, rejectMsg: string): Promise<T> {
    return new Promise<T>( (resolve, reject) => {
        setTimeout( () => reject(rejectMsg), timeoutMS);

        promise
            .then( (result: T) => resolve(result))
            .catch( (err: any) => reject(err));
    });
}

export function isGoodDate(date: Date): boolean {
    return !isNaN(date.valueOf());
}

//// Connection helpers

export interface IConnectionInfo {
    readonly host: string;
    readonly port: number;
    // If we start supporting HTTPS, could add a 'protocol' field,
    // but at that point it might be cleaner to just save the URI.
}

export function isGoodPort(port: number | undefined): boolean {
    return port != null && !isNaN(port) && Number.isInteger(port) && port > 1024 && port < 65536;
}

/**
 * Convert a ConnectionInfo to an HTTP URI.
 */
export function buildMCUrl(connInfo: IConnectionInfo): Uri {
    return Uri.parse(`http://${connInfo.host}:${connInfo.port}`);
}

/**
 * Convert a URI to a ConnectionInfo (for saving to Settings).
 * A URI type with a 'port' field would be preferable, but vscode does not have this.
 */
export function getConnInfoFrom(url: Uri): IConnectionInfo | undefined {
    const colonIndex: number = url.authority.indexOf(":");

    const host = url.authority.substring(0, colonIndex);
    const portStr = url.authority.substring(colonIndex + 1, url.authority.length);

    const port: number = Number(portStr);
    if (!isGoodPort(port)) {
        return undefined;
    }
    // Log.i(`Loaded connection info host ${host} port ${port}`);

    const result: IConnectionInfo = {
        host: host,
        port: port
    };
    return result;
}
