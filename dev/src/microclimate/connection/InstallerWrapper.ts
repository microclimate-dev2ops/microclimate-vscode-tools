/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
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
import * as child_process from "child_process";
import * as fs from "fs";
import * as os from "os";

import * as MCUtil from "../../MCUtil";
import Log from "../../Logger";

const BIN_DIR = "bin";
const INSTALLER_DIR = "installer";
const INSTALLER_EXECUTABLE = "installer";
const INSTALLER_EXECUTABLE_WIN = "installer.exe";

enum InstallerCommands {
    // INSTALL = "install",
    START = "start",
    STOP = "stop",
    STOP_ALL = "stop-all",
}

const INSTALLER_COMMANDS: { [key in InstallerCommands]: { action: string, userActionName: string } } = {
    start: { action: "start", userActionName: "Starting Codewind" },
    stop: { action: "stop", userActionName: "Stopping Codewind" },
    "stop-all": { action: "stop-all", userActionName: "Stopping Codewind and applications" },
};

const START_TIMEOUT = 60000;

namespace InstallerWrapper {

    /**
     * Returns the location of the executable as within the extension. It cannot be run from this location - see prepare()
     */
    function getInternalExecutable(): string {
        const platform = MCUtil.getOS();
        const executable = platform === "windows" ? INSTALLER_EXECUTABLE_WIN : INSTALLER_EXECUTABLE;
        if (platform !== "macos") {
            throw new Error("Codewind can only be started on macOS at this time.");
        }
        return path.join(global.__extRoot, BIN_DIR, INSTALLER_DIR, platform, executable);
    }

    // abs path to dir containing copied-out executable
    let executableDir: string;
    // abs path to copied-out executable
    let executablePath: string;
    // serves as a lock, only one operation at a time.
    let currentOperation: InstallerCommands | undefined;

    /**
     * Copies the installer to somewhere writeable, and sets executableDir and exectablePath.
     */
    async function prepare(): Promise<void> {
        executableDir = os.tmpdir();
        const executable = getInternalExecutable();
        const executableBasename = path.basename(executable);
        executablePath = path.join(executableDir, executableBasename);
        Log.d(`Copying ${executable} to ${executablePath}`);
        fs.copyFileSync(executable, path.join(executableDir, executableBasename));
        Log.i("Installer copy succeeded");
    }

    function getUserActionName(cmd: InstallerCommands): string {
        return INSTALLER_COMMANDS[cmd].userActionName;
    }

    async function installerExec(cmd: InstallerCommands): Promise<void> {
        if (!executablePath) {
            // do this once only
            await prepare();
        }
        // tmpDir will now be set too
        else if (currentOperation != null) {
            vscode.window.showWarningMessage(`Already ${getUserActionName(cmd)}`);
            return;
        }

        Log.i(`Running installer command: ${cmd}`);

        const userMsg = getUserActionName(cmd) + "...";
        currentOperation = cmd;

        await vscode.window.withProgress({
            cancellable: false,
            location: vscode.ProgressLocation.Notification,
            title: userMsg,
        }, (_progress) => {
            return new Promise<void>((resolve, reject) => {
                child_process.execFile(executablePath, [ cmd ], {
                    cwd: executableDir,
                    timeout: START_TIMEOUT,
                }, async (err, stdout, stderr) => {
                    if (err) {
                        Log.e("Error running with installer", err);
                        Log.e("Stdout:", stdout.toString());
                        Log.e("Stderr:", stderr.toString());
                        currentOperation = undefined;
                        return reject(err);
                    }
                    Log.i(`Successfully ran installer command: ${cmd}`);

                    currentOperation = undefined;
                    resolve();
                });
            });
        });
    }

    export async function start(): Promise<void> {
        return installerExec(InstallerCommands.START);
    }

    export async function stop(): Promise<void> {
        return installerExec(InstallerCommands.STOP);
    }

    export async function stopAll(): Promise<void> {
        return installerExec(InstallerCommands.STOP_ALL);
    }
}

export default InstallerWrapper;
