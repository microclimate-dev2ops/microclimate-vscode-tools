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

import ProjectState from "./ProjectState";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import Log from "../../Logger";
import Project from "./Project";

const STRING_NS = StringNamespaces.PROJECT;

/**
 * Wrapper for a Promise which resolves when the project reaches one of the states set in the constructor,
 * or rejects when the project does not reach one of those states in time.
 */
export default class ProjectPendingState {

    // if the promise this pending state is tied to has resolved or rejected
    private fulfilled: boolean = false;

    constructor(
        private readonly project: Project,
        private readonly states: ProjectState.AppStates[],
        private readonly _resolve: ( (newState: ProjectState.AppStates) => void ),
        private readonly _reject: ( (err: string) => void ),
        private readonly timeout: NodeJS.Timeout,
    ) {
        if (states.length === 0) {
            Log.e("Creating projectPendingState with no states!");
        }
    }

    public shouldResolve(currentState: ProjectState): boolean {
        return this.states.includes(currentState.appState);
    }

    public resolve(): void {
        if (this.fulfilled) {
            // this means the project instance didn't let go of this object when it should have
            Log.e("Pending state is being resolved or rejected for a second time!");
            return;
        }

        Log.d("Resolving pending state(s), state is " + this.project.state.appState);
        this._resolve(this.project.state.appState);
        this.clear();
    }

    public reject(timeoutMs?: number): void {
        if (this.fulfilled) {
            // this means the project instance didn't let go of this object when it should have
            Log.e("Pending state is being rejected but has already been cleared!");
            return;
        }

        const rejectMsg = this.getRejectPendingStateMsg(timeoutMs);
        Log.d("Rejecting pending state(s) with message:", rejectMsg);
        this._reject(rejectMsg);
        this.clear();
    }

    /**
     * Only call after resolve|reject
     */
    private clear(): void {
        Log.d("Clearing pending app states: " + JSON.stringify(this.states));
        clearTimeout(this.timeout);
        this.fulfilled = true;
    }

    public pendingStatesAsStr(): string {
        if (this.states.length > 1) {
            return this.states.join(Translator.t(StringNamespaces.DEFAULT, "statesSeparator"));
        }
        else {
            return this.states[0].toString();
        }
    }

    private getRejectPendingStateMsg(timeoutMs?: number): string {
        let msg;

        if (timeoutMs != null) {
            msg = Translator.t(STRING_NS, "didNotReachStateWithTime",
                { projectName: this.project.name, states: this.pendingStatesAsStr(), timeoutS: timeoutMs / 1000 }
            );
        }
        else {
            msg = Translator.t(STRING_NS, "didNotReachState", { projectName: this.project.name, states: this.pendingStatesAsStr() });
        }

        return msg;
    }
}
