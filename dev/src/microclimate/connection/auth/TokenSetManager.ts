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

// for storing tokens in the ExtensionContext
const TOKEN_PREFIX = "token-";

/**
 * Tokenset received from OIDC token_endpoint
 * https://openid.net/specs/openid-connect-core-1_0.html#TokenResponse
 */
export interface ITokenSet {
    access_token: string;
    refresh_token: string;
    id_token?: string;          // the id_token is present when we first receive a tokenset from the server,
                                // but is discarded after validation is completed
    token_type: string;         // expected to be "Bearer"
    expires_in: number;         // in seconds - seems to always be 43200 (12hrs)
    scope: string;              // should be "openid"
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
        // At this time, there's no reason for us to store the id_token once it's been validated.
        delete newTokenSet.id_token;

        // REMOVE
        Log.d("TOKENSET!", newTokenSet);
        await setTokensFor(hostname, newTokenSet);
    }
}

export default TokenSetManager;
