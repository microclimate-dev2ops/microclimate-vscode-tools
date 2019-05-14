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
        if (platform === "windows") {
            throw new Error("The installer does not support Windows at this time.");
        }
        return path.join(global.__extRoot, BIN_DIR, INSTALLER_DIR, platform, executable);
    }

    let tmpDir: string;
    let executableLoc: string;
    // serves as a lock, only one operation at a time.
    let currentOperation: InstallerCommands | undefined;

    async function prepare(): Promise<string> {
        // We have to copy the executable to somewhere this user has write permissions so it can write out ./installer-docker-compose
        tmpDir = os.tmpdir();
        const executable = getInternalExecutable();
        const executableBasename = path.basename(executable);
        const tmpExecutableLoc = path.join(tmpDir, executableBasename);
        Log.d(`Copying ${executable} to ${tmpExecutableLoc}`);
        fs.copyFileSync(executable, path.join(tmpDir, executableBasename));
        Log.d("Installer copy succeeded");
        return tmpExecutableLoc;
    }

    function getUserActionName(cmd: InstallerCommands): string {
        return INSTALLER_COMMANDS[cmd].userActionName;
    }

    async function installerExec(cmd: InstallerCommands): Promise<void> {
        if (!executableLoc) {
            // do this once only
            executableLoc = await prepare();
        }
        // tmpDir will now be set too
        else if (currentOperation != null) {
            vscode.window.showWarningMessage(`Already ${getUserActionName(cmd)}`);
            return;
        }

        const userMsg = getUserActionName(cmd) + "...";
        currentOperation = cmd;

        await vscode.window.withProgress({
            cancellable: false,
            location: vscode.ProgressLocation.Notification,
            title: userMsg,
        }, (_progress) => {
            return new Promise((resolve, reject) => {
                child_process.execFile(executableLoc, [ cmd ], {
                    cwd: tmpDir,
                    timeout: START_TIMEOUT,
                }, async (err, stdout, stderr) => {
                    if (err) {
                        Log.e("Error starting with installer", err);
                        Log.e("Stdout:", stdout.toString());
                        Log.e("Stderr:", stderr.toString());
                        currentOperation = undefined;
                        return reject(err);
                    }
                    Log.i("Successfully started CW with installer");

                    if (cmd === InstallerCommands.START) {
                        // additional delay
                        await new Promise((resolve2) => setTimeout(resolve2, 5000));
                    }

                    currentOperation = undefined;
                    resolve();
                    Log.d("Finished starting Codewind");
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
