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

import { Uri } from "vscode";
import * as path from "path";
import Log from "./Logger";
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

export function isGoodStatusCode(statusCode: number | undefined): boolean {
    return statusCode != null && !isNaN(statusCode) && statusCode >= 200 && statusCode < 400;
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
    return Uri.parse(`http://${connInfo.host}:${connInfo.port}`);       // non-nls
}

/**
 * Convert a URI to a ConnectionInfo (for saving to Settings).
 * A URI type with a 'port' field would be preferable, but vscode does not have this.
 */
export function getConnInfoFrom(url: Uri): IConnectionInfo {
    const colonIndex: number = url.authority.indexOf(":");      // non-nls

    const host = url.authority.substring(0, colonIndex);
    const portStr = url.authority.substring(colonIndex + 1, url.authority.length);

    const port: number = Number(portStr);
    if (!isGoodPort(port)) {
        Log.e(`Bad port ${portStr} passed to getConnInfoFrom`);
    }
    // Log.i(`Loaded connection info host ${host} port ${port}`);

    const result: IConnectionInfo = {
        host: host,
        port: port
    };
    return result;
}

const charsToRemove = "·/_,:;";
const toRemoveRx = new RegExp(charsToRemove.split("").join("|"), "g");

/**
 * Not a 'normal' slug function, but makes strings look nice and normal and kebab-cased.
 * Replace url-unfriendly characters, spaces and '.'s with '-'.
 *
 * Inspired by https://medium.com/@mhagemann/the-ultimate-way-to-slugify-a-url-string-in-javascript-b8e4a0d849e1
 */
export function slug(s: string): string {
    return s.toLowerCase()
        .replace(/\s+/g, "-")           // spaces to -
        .replace(/\./g, "-")            // literal . to -
        .replace(toRemoveRx, "-")       // other special chars to -
        // .replace(/[^\w\-]+/g, "")    // remove all non-words
        .replace(/\-\-+/g, "-")         // replace multiple - with single
        .replace(/^-+/, "")             // trim - from start
        .replace(/-+$/, "");            // trim - from end
}
