import * as path from "path";
import * as fs from "fs";

export interface IconPaths {
    readonly light: string;
    readonly dark: string;
}

/**
 * Assumes that this icon exists in both the 'dark' and 'light' folders, and has the same name in both folders.
 *
 * @param iconName
 *      The file name of the icon including extension, eg microclimate.svg
 * @param darkAndLight
 *      If false, both themes will use the icon in the "light" folder (so there must always be an icon there)
 */
const resFolderName = "res";
const imgFolderName = "img";

export function getIconObj(iconName: string, lightOnly: Boolean = false): IconPaths {
    const light = path.join(global.__extRoot, resFolderName, imgFolderName, "light", iconName);

    let dark;
    if (lightOnly) {
        dark = light;
    }
    else {
        dark = path.join(global.__extRoot, resFolderName, imgFolderName, "dark",  iconName);
    }

    // Log if the file is missing or can't be read
    const onIconError = (err: any) => {
        if (err) {
            console.error("Icon error: " + err);
        }
    };
    fs.access(light, fs.constants.R_OK, onIconError);
    fs.access(dark, fs.constants.R_OK, onIconError);

    return {
        light: light,
        dark: dark
    };
}

/**
 * Get a string which can be included in a status bar message to render an octicon.
 * The returned value will be "$(iconName) or $(iconName~spin)"
 *
 * @param iconName - One of the octicons from https://octicons.github.com
 */
export function getOcticon(iconName: string, spinning: Boolean = false): string {
    return `$(${iconName}${spinning ? "~spin": ""})`;
}

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

export function getStartMode(debug: Boolean): string {
    return debug ? "debug" : "run";
}