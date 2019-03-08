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

// import * as vscode from "vscode";
import Log from "../../../Logger";

/**
 * Wraps a promise which is created when the user's browser is launched to log in.
 * Resolves to a tokenset when the OAuth server calls-back with a success status,
 * or rejects with an error when the authentication fails or is cancelled.
 * Also stores the `state` parameter so we can verify the state given to the authorize endpoint matches the state in the callback.
 */
export default class PendingAuthentication {

    public readonly promise: Promise<void>;
    private resolveFunc: ( () => void ) | undefined;
    private rejectFunc : ( (err : string) => void ) | undefined;

    constructor(
        // public readonly redirectUri: string,
        public readonly masterIP: string,
        public readonly state: string,
        public readonly nonce: string,
        public readonly openIDClient: any,
    ) {

        this.promise = new Promise<void>( (resolve_, reject_) => {
            this.resolveFunc = resolve_;
            this.rejectFunc = reject_;
        });
    }

    public resolve(): void {
        if (this.resolveFunc != null) {
            this.resolveFunc();
        }
        else {
            Log.e("Null resolvePendingAuth");
        }
        Log.d(`Resolved pending auth`);
    }

    public reject(err: string): void {
        if (this.rejectFunc != null) {
            this.rejectFunc(err);
        }
        else {
            Log.e("Null rejectPendingAuth");
        }
        Log.d(`Rejected pending auth`);
    }
}
