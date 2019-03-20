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
import * as path from "path";

namespace MCUtil {

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

export function isGoodStatusCode(statusCode: number | undefined): boolean {
    return statusCode != null && !isNaN(statusCode) && statusCode >= 200 && statusCode < 400;
}

export function isGoodPort(port: number | undefined): boolean {
    return port != null && !isNaN(port) && Number.isInteger(port) && port > 0 && port < 65536;
}

export function isLocalhost(authority: string): boolean {
    authority = getHostnameFromAuthority(authority);
    return authority === "localhost" || authority === "127.0.0.1";
}

export function assembleUrl(protocol: string, authority: string, port?: number, path_?: string): vscode.Uri {
    let rawUri = `${protocol}://${authority}`;
    if (port != null) {
        rawUri += ":" + port;
    }
    if (path_) {
        rawUri += path_;
    }
    return vscode.Uri.parse(rawUri);
}

/**
 * @returns the uri's "authority" without the port if there is one, or the whole authority if there is no port
 */
export function getHostnameFromAuthority(authority: string): string {
    const colonIndex: number = authority.indexOf(":");      // non-nls
    if (colonIndex === -1) {
        // no port
        return authority;
    }
    return authority.substring(0, colonIndex);
}

}

export default MCUtil;
