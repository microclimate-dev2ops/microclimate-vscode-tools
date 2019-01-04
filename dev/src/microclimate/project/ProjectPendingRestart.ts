/*******************************************************************************
 * Copyright (c) 2018 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import ProjectState from "./ProjectState";
import Log from "../../Logger";
import Project from "./Project";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Translator from "../../constants/strings/translator";
import StartModes from "../../constants/StartModes";
import attachDebuggerCmd from "../../command/AttachDebuggerCmd";
import Resources from "../../constants/Resources";

const STRING_NS = StringNamespaces.PROJECT;

const RESTART_STATES_RUN = [
    ProjectState.AppStates.STOPPED,
    ProjectState.AppStates.STARTING,
    ProjectState.AppStates.STARTED
];

const RESTART_STATES_DEBUG = [
    ProjectState.AppStates.STOPPED,
    ProjectState.AppStates.DEBUG_STARTING,
    ProjectState.AppStates.DEBUGGING
];

export default class ProjectPendingRestart {

    // These are set in the constructor, but the compiler doesn't see that. These will never be undefined.
    private resolve: (() => void) | undefined;
    private reject:  (() => void) | undefined;
    private timeoutID: NodeJS.Timeout | undefined;

    // Expect the project to go through this set of states in this order.
    // Will be set to one of the RESTART_STATES arrays above.
    private readonly expectedStates: ProjectState.AppStates[];
    // Index in expectedStates pointing to the state we expect next.
    private nextStateIndex: number = 0;

    private hasReceivedRestartEvent: boolean = false;
    private restartEventInterval: NodeJS.Timeout | undefined;

    constructor(
        private readonly project: Project,
        private readonly startMode: StartModes.Modes,
        timeoutMs: number,
    ) {
        this.expectedStates = StartModes.isDebugMode(startMode) ? RESTART_STATES_DEBUG : RESTART_STATES_RUN;

        const restartPromise = new Promise<void>( (resolve_, reject_) => {
            this.resolve = resolve_;
            this.reject = reject_;

            this.timeoutID = setTimeout( () => {
                Log.i("Rejecting restart");
                this.fulfill(false, `failed to restart within ${timeoutMs / 1000} seconds`);
            }, timeoutMs);
        });

        const restartMsg = `${Resources.getOcticon(Resources.Octicons.sync, true)}` +
            ` Restarting ${project.name} into ${StartModes.getUserFriendlyStartMode(startMode)} mode`;

        vscode.window.setStatusBarMessage(restartMsg, restartPromise);
    }

    public async onStateChange(currentState: ProjectState.AppStates): Promise<void> {
        if (currentState === this.expectedStates[this.nextStateIndex]) {
            this.nextStateIndex++;

            if (this.nextStateIndex === this.expectedStates.length) {
                // The restart was successful
                Log.i("Resolving restart");
                this.fulfill(true);
                return;
            }
            else if (this.hasReceivedRestartEvent && currentState === ProjectState.AppStates.DEBUG_STARTING) {
                this.attachDebugger();
            }
            else if (!this.hasReceivedRestartEvent &&
                    (currentState === ProjectState.AppStates.STARTING || currentState === ProjectState.AppStates.DEBUG_STARTING)) {
                this.waitForRestartEvent();
            }

            Log.d("Restart expecting next state: " + this.expectedStates[this.nextStateIndex]);
        }
    }

    public onReceiveRestartEvent(success: boolean, error?: string): void {
        Log.d(this.project.name + ": pending restart received restart event");

        if (this.hasReceivedRestartEvent) {
            Log.e(this.project.name + ": multiple restart events!");
        }

        this.hasReceivedRestartEvent = true;
        if (!success) {
            this.fulfill(success, error);
        }
        else if (ProjectState.getDebuggableStates().includes(this.project.state.appState)) {
            this.attachDebugger();
        }
    }

    private async waitForRestartEvent(): Promise<void> {
        // no rejection because it shares this instance's timeout
        return new Promise<void>( (resolve) => {
            Log.d(this.project.name + ": waiting for restart event");
            this.restartEventInterval = setInterval( () => {
                if (this.hasReceivedRestartEvent) {
                    resolve();
                }
            }, 2500);
        });
    }

    private async attachDebugger(): Promise<void> {
        Log.d("Attaching debugger as part of restart");

        try {
            const debuggerAttached: boolean = await attachDebuggerCmd(this.project, true);
            if (!debuggerAttached) {
                vscode.window.showErrorMessage(
                    Translator.t(STRING_NS, "restartDebugAttachFailure",
                    { startMode: StartModes.Modes.DEBUG })
                );

                // If we're debugging init, the restart fails here because it will get stuck without the debugger attach
                if (this.startMode === StartModes.Modes.DEBUG) {
                    this.fulfill(false, "Debugger attach failed");
                }
            }
        }
        catch (err) {
            // attachDebuggerCmd shouldn't throw/reject, but just in case:
            Log.w("Debugger attach failed or was cancelled by user", err);
            vscode.window.showErrorMessage(err);
        }
    }

    private fulfill(success: boolean, error?: string): void {
        Log.d("Fulfilling pending restart for " + this.project.name);

        if (this.resolve == null || this.reject == null || this.timeoutID == null) {
            // will never happen
            Log.e("Cannot fulfill pending restart because of an initialization failure");
            return;
        }

        if (success) {
            this.resolve();

            const successMsg = Translator.t(STRING_NS, "restartSuccess",
                { projectName: this.project.name, startMode: StartModes.getUserFriendlyStartMode(this.startMode) }
            );
            Log.i(successMsg);

            vscode.window.showInformationMessage(successMsg);
        }
        else {
            this.reject();

            let failMsg: string;
            if (error != null) {
                failMsg = Translator.t(STRING_NS, "restartFailureWithReason",
                    { projectName: this.project.name, startMode: StartModes.getUserFriendlyStartMode(this.startMode), reason: error }
                );
            }
            else {
                failMsg = Translator.t(STRING_NS, "restartFailure",
                    { projectName: this.project.name, startMode: StartModes.getUserFriendlyStartMode(this.startMode) }
                );
            }

            vscode.window.showErrorMessage(failMsg);
        }

        clearTimeout(this.timeoutID);
        if (this.restartEventInterval != null) {
            clearInterval(this.restartEventInterval);
        }
        this.project.onRestartFinish();
    }
}
