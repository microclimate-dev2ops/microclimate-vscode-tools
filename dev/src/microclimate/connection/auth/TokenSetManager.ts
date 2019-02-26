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
 * Tokenset received from token endpoint when using the implicit flow.
 * Other flows may also feature refresh_token, id_token, and scope.
 */
export interface ITokenSet {
    readonly access_token: string;
    readonly token_type: string;        // expected to be "Bearer"
    readonly expires_at: number;        // in millis - need to use simple type here so Context can save it - Date doesn't work.
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
            Log.i(`Updated token for ${hostname}, new token expires at ${newTokens.expires_at}`);
        }
        else {
            Log.d(`Cleared token for ${hostname}`);
        }
    }
}

export default TokenSetManager;
