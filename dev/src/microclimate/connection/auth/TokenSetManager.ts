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

import Log from "../../../Logger";
import AuthUtils from "./AuthUtils";

// for storing tokens in the ExtensionContext
const TOKEN_PREFIX = "token-";

/**
 * Tokenset received from OIDC token_endpoint
 * https://openid.net/specs/openid-connect-core-1_0.html#TokenResponse
 */
export interface ITokenSet {
    access_token: string;
    refresh_token: string;      // in milliseconds - 42000ms = 12 hours`
    // We have no interest in any of the user data, so we don't use the id_token
    // id_token: string;
    token_type: string;         // eg "Bearer"
    expires_in: number;
    scope: string;
}

namespace TokenSetManager {
    export function getTokenSetFor(hostname: string): ITokenSet | undefined {
        const key = TOKEN_PREFIX + hostname;
        const memento = global.extGlobalState as vscode.Memento;
        const tokenSet = memento.get<ITokenSet>(key);
        if (!tokenSet) {
            Log.i("no token for hostname:", hostname);
            return undefined;
        }
        return tokenSet;
    }

    export async function setTokensFor(hostname: string, newTokens: ITokenSet | undefined): Promise<void> {
        const key = TOKEN_PREFIX + hostname;
        const memento = global.extGlobalState as vscode.Memento;
        await memento.update(key, newTokens);
        if (newTokens != null) {
            // at the time of writing, expires_in is 12 hours in seconds
            const expiry = new Date(Date.now() + (newTokens.expires_in * 1000));
            Log.d(`Updated token for ${hostname}, new token expires at ${expiry}`);
        }
        else {
            Log.d(`Cleared token for ${hostname}`);
        }
    }

    export async function onNewTokenSet(hostname: string, newTokenSet: ITokenSet): Promise<void> {
        if ((newTokenSet as any).id_token) {
            // We don't use the id_token, but I can't get the server to not give me one
            delete (newTokenSet as any).id_token;
        }

        if (!validateTokenSet(newTokenSet)) {
            Log.e("New TokenSet was not as expected!");
            // Log.e(newTokenSet);
            throw new Error("Received unexpected response from refresh request.");
        }

        // REMOVE
        Log.d("TOKENSET!", newTokenSet);
        await setTokensFor(hostname, newTokenSet);
    }

    function validateTokenSet(tokenSet: ITokenSet): boolean {
        return tokenSet.access_token != null &&
            tokenSet.token_type != null &&
            tokenSet.refresh_token != null &&
            tokenSet.token_type.toLowerCase() === "bearer" &&
            tokenSet.scope.includes(AuthUtils.OIDC_SCOPE);
    }
}

export default TokenSetManager;
