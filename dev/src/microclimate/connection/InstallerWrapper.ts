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
import * as readline from "readline";

import * as MCUtil from "../../MCUtil";
import Log from "../../Logger";
import Commands from "../../constants/Commands";

const BIN_DIR = "bin";
const INSTALLER_DIR = "installer";
const INSTALLER_EXECUTABLE = "codewind-installer";
const INSTALLER_EXECUTABLE_WIN = "codewind-installer.exe";

enum InstallerCommands {
    INSTALL = "install",
    START = "start",
    STOP = "stop",
    STOP_ALL = "stop-all",
    STATUS = "status",
}

// const INSTALLER_COMMANDS: { [key in InstallerCommands]: { action: string, userActionName: string } } = {
const INSTALLER_COMMANDS: { [key: string]: { action: string, userActionName: string } } = {
    install:    { action: "install",    userActionName: "Downloading Codewind images" },
    start:      { action: "start",      userActionName: "Starting Codewind" },
    stop:       { action: "stop",       userActionName: "Deactivating Codewind" },
    "stop-all": { action: "stop-all",   userActionName: "Deactivating Codewind" },
    // status:     { action: "status",     userActionName: "Checking if Codewind is running" },
};

const START_TIMEOUT = 60000;

namespace InstallerWrapper {

    /**
     * Returns the location of the executable as within the extension. It cannot be run from this location - see prepare()
     */
    function getInternalExecutable(): string {
        const platform = MCUtil.getOS();
        const executable = platform === "windows" ? INSTALLER_EXECUTABLE_WIN : INSTALLER_EXECUTABLE;
        return path.join(global.__extRoot, BIN_DIR, INSTALLER_DIR, platform, executable);
    }

    // abs path to copied-out executable. Set and returned by initialize()
    let _executablePath: string;

    /**
     * Copies the installer to somewhere writeable, and sets executableDir and exectablePath.
     * If these are already set, do nothing.
     */
    async function initialize(): Promise<string> {
        if (_executablePath) {
            return _executablePath;
        }
        const executableDir = os.tmpdir();
        const executable = getInternalExecutable();
        const executableBasename = path.basename(executable);
        _executablePath = path.join(executableDir, executableBasename);
        Log.d(`Copying ${executable} to ${_executablePath}`);
        fs.copyFileSync(executable, path.join(executableDir, executableBasename));
        Log.i("Installer copy succeeded");
        return _executablePath;
    }

    function getUserActionName(cmd: InstallerCommands): string {
        return INSTALLER_COMMANDS[cmd].userActionName;
    }

    // serves as a lock, only one operation at a time.
    let currentOperation: InstallerCommands | undefined;

    async function installerExec(cmd: InstallerCommands): Promise<void> {
        const executablePath = await initialize();
        if (currentOperation != null) {
            vscode.window.showWarningMessage(`Already ${getUserActionName(cmd)}`);
            return;
        }

        Log.i(`Running installer command: ${cmd}`);

        const userMsg = getUserActionName(cmd);
        currentOperation = cmd;

        const executableDir = path.dirname(executablePath);

        await vscode.window.withProgress({
            cancellable: false,
            location: vscode.ProgressLocation.Notification,
            title: userMsg,
        }, (progress) => {
            return new Promise<void>((resolve, reject) => {
                const child = child_process.execFile(executablePath, [ cmd ], {
                    cwd: executableDir,
                    timeout: START_TIMEOUT,
                }, async (err, stdout, stderr) => {
                    if (err) {
                        Log.e("Error running with installer", err);
                        if (cmd === InstallerCommands.INSTALL) {
                            const stdoutLog = path.join(executableDir, "install-error-stdout.log");
                            fs.writeFileSync(stdoutLog, stdout);
                            const stderrLog = path.join(executableDir, "install-error-stderr.log");
                            fs.writeFileSync(stderrLog, stderr);
                            Log.e("Error installing, wrote output to " + executableDir);
                            vscode.commands.executeCommand(Commands.VSC_OPEN, stdoutLog, stderrLog);
                            return reject(err);
                        }

                        if (!stdout) {
                            Log.e("No std output");
                        }
                        else {
                            Log.e("Stdout:", stdout.toString());
                        }

                        if (!stderr) {
                            Log.e("No std error");
                        }
                        else {
                            Log.e("Stderr:", stderr.toString());
                        }
                        currentOperation = undefined;
                        return reject(err);
                    }
                    Log.i(`Successfully ran installer command: ${cmd}`);

                    currentOperation = undefined;
                    resolve();
                });

                if (cmd !== InstallerCommands.INSTALL) {
                    const reader = readline.createInterface(child.stdout);
                    reader.on("line", (line) => {
                        progress.report({ message: line });
                    });
                }
            });
        });
    }

    enum InstallerStates {
        NOT_INSTALLED,
        STOPPED,
        STARTED,
    }

    /**
     * `installer status` command.
     * This is a separate function because it exits quickly so the progress is not useful, and we expect non-zero exit codes
     */
    async function getInstallerState(): Promise<InstallerStates> {
        const executablePath = await initialize();

        return new Promise<InstallerStates>((resolve, reject) => {
            const child = child_process.execFile(executablePath, [ InstallerCommands.STATUS ], {
                timeout: 10000,
            }, async (_err, stdout, stderr) => {
                // err (non-zero exit) is expected
                if (stderr) {
                    Log.e("Stderr checking status:", stderr.toString());
                    Log.e("Stdout checking status:", stdout.toString());
                }
            });

            // from https://github.ibm.com/dev-ex/portal/issues/945
            // 0 - not installed, 1 - installed but stopped, 2 - installed and running
            child.on("exit", (code, _signal) => {
                if (code === 0) {
                    return resolve(InstallerStates.NOT_INSTALLED);
                }
                else if (code === 1) {
                    return resolve(InstallerStates.STOPPED);
                }
                else if (code === 2) {
                    return resolve(InstallerStates.STARTED);
                }
                return reject(`Unexpected exit code ${code} from status check`);
            });
        });
    }

    async function install(): Promise<void> {
        const installAffirmBtn = "Proceed";
        const moreInfoBtn = "More Info";
        const response = await vscode.window.showInformationMessage(
            `The Codewind server needs to be installed before the extension can be used. ` +
            `This downloads the Codewind Docker images, which are about 1GB in size.`,
            { modal: true }, installAffirmBtn, moreInfoBtn,
        );

        if (response !== installAffirmBtn) {
            throw new Error("You cannot use Codewind until the server images are installed.");
        }
        await installerExec(InstallerCommands.INSTALL);
    }

    export async function start(): Promise<void> {
        const status = await getInstallerState();
        if (status === InstallerStates.STARTED) {
            return;
        }
        else if (status === InstallerStates.NOT_INSTALLED) {
            await install();
        }
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
