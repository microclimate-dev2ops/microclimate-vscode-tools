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

export interface IAuthCallbackParams {
    code: string;
    state: string;
}

/**
 * Wrapper for a Promise that represents an in-progress authentication flow.
 * Resolves to the authentication code which can then be exchanged for a token, or rejects with an error message.
 * Stores the in-progress flow's redirectUri and state parameters.
 */
export default class PendingAuthentication {

    public readonly promise: Promise<IAuthCallbackParams>;
    private resolveFunc: ( (cbParams: IAuthCallbackParams) => void ) | undefined;
    private rejectFunc : ( (err : string) => void ) | undefined;

    constructor(
        public readonly redirectUri: string,
        // public readonly state: string,
        // public readonly nonce: string,
    ) {

        this.promise = new Promise<IAuthCallbackParams>( (resolve_, reject_) => {
            this.resolveFunc = resolve_;
            this.rejectFunc = reject_;
        });
    }

    public resolve(cbParams: IAuthCallbackParams): void {
        if (this.resolveFunc != null) {
            this.resolveFunc(cbParams);
        }
        else {
            Log.e("Null resolvePendingAuth");
        }
        Log.i(`Resolved pending auth`);
    }

    public reject(err: string): void {
        if (this.rejectFunc != null) {
            this.rejectFunc(err);
        }
        else {
            Log.e("Null rejectPendingAuth");
        }
        Log.i(`Rejected pending auth`);
    }
}
