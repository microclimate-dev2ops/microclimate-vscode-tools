import * as fs from "fs";
import * as path from "path";
import { Logger } from "../Logger";

const resFolderName = "res";
const styleFolderName = "css";
const imgFolderName = "img";
const lightFolderName = "light";
const darkFolderName = "dark";


function getResourcePath(...paths: string[]): string {
    return path.join(global.__extRoot, resFolderName, ...paths);
}

export function getCss(filename: string): string {
    return getResourcePath(styleFolderName, filename);
}

/**
 * Resolve the icon with the given name and return the paths to it,
 * which can then be assigned to a vscode iconPath (eg on a TreeItem).
 * If an icon cannot be found, an error is will be logged.
 *
 * A requested icon is always assumed to have a file in the 'dark' folder.
 * If there is a matching one in the 'light' folder, that will be used for light themes.
 *
 */
export function getIconPaths(icon: Icons): IconPaths {
    const darkPath = getResourcePath(imgFolderName, darkFolderName, icon);
    // make sure the file exists and is readable
    fs.access(darkPath, fs.constants.R_OK, (err: NodeJS.ErrnoException) => {
        if (err) {
            Logger.logE(`Icon not found! ${icon} - error:`, err);
        }
    });

    let lightPath = getResourcePath(imgFolderName, lightFolderName, icon);
    fs.access(lightPath, fs.constants.R_OK, (err: NodeJS.ErrnoException) => {
        if (err) {
            // The light icon does not exist or cannot be read, so we use the dark icon.
            // This is normal if there is no corresponding light icon.
            // Logger.log(`Light Icon not found! ${icon} - error:`, err);
            lightPath = darkPath;
        }
    });

    return {
        light: lightPath,
        dark: darkPath
    };
}

// VSC allows providing a separate icon for dark or light themes.
// This is the format the API expects when icons are set.
export interface IconPaths {
    readonly light: string;
    readonly dark: string;
}

export enum Icons {
    Microclimate = "microclimate.svg",
    // project types
    Microprofile = "lang_java.svg",
    Spring       = "lang_java.svg",
    Node         = "lang_node.svg",
    Swift        = "lang_swift.svg",
    Python       = "lang_python.svg",
    Go           = "lang_go.svg",
    Docker       = "lang_generic.svg",
    Generic      = "lang_generic.svg"
}

// https://octicons.github.com/
export enum Octicons {
    sync = "sync",
    bug = "bug"
}

/**
 * Get a string which can be included in a status bar message to render an octicon.
 * The returned value will be "$(iconName) or $(iconName~spin)"
 *
 * @param iconName - One of the octicons from https://octicons.github.com
 */
export function getOcticon(iconName: Octicons, spinning: Boolean = false): string {
    return `$(${iconName}${spinning ? "~spin": ""})`;
}