import { Uri } from "vscode";
import * as path from "path";

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

export function isGoodPort(port: number | undefined): Boolean {
    return port != null && !isNaN(port) && Number.isInteger(port) && port > 1024 && port < 65536;
}

export function buildMCUrl(host: string, port: number): Uri {
    return Uri.parse(`http://${host}:${port}`);
}

export function getHostPort(url: Uri): [string, number] | undefined {
    const colonIndex: number = url.authority.indexOf(":");

    const host = url.authority.substring(0, colonIndex);
    const portStr = url.authority.substring(colonIndex, url.authority.length);

    const port: number = Number(portStr);
    if (!isGoodPort(port)) {
        return undefined;
    }
    console.log(`Loaded host ${host} port ${port}`);
    return [host, port];
}

/**
 * @return "debug" or "run", the supported startModes.
 */
export function getStartMode(debug: Boolean): string {
    return debug ? "debug" : "run";
}