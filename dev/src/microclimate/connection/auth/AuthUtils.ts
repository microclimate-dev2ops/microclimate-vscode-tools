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
import * as request from "request-promise-native";

import Log from "../../../Logger";
import Settings from "../../../constants/Settings";
import Requester from "../../project/Requester";

/**
 * Helper functions, interfaces and constants used by Authenticator.ts.
 *
 * **No other file should use any of these functions or constants**.
 */
namespace AuthUtils {
    // for storing tokens in the ExtensionContext
    const TOKEN_PREFIX = "token-";

    export const OIDC_SCOPE = "openid";

    // ICP OIDC server info
    const OIDC_SERVER_PORT = 8443;
    const OIDC_SERVER_PATH = "/oidc/endpoint/OP";
    const OIDC_REVOKE_ENDPOINT = "/revoke";

    export const TIMEOUT: number = 10000;

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
        await AuthUtils.setTokensFor(hostname, newTokenSet);
    }

    function validateTokenSet(tokenSet: ITokenSet): boolean {
        return tokenSet.access_token != null &&
            tokenSet.token_type != null &&
            tokenSet.refresh_token != null &&
            tokenSet.token_type.toLowerCase() === "bearer" &&
            tokenSet.scope.includes(OIDC_SCOPE);
    }

    /**
     * Show a message warning the user the browser will open and then call-back to VS Code.
     * If the user has already seen and hidden the message, don't show it.
     * @returns true, unless the user pressed "Cancel" to cancel opening the browser.
     */
    export async function shouldOpenBrowser(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration(Settings.CONFIG_SECTION);
        if (!config.get<boolean>(Settings.SHOW_OPEN_LOGIN_MSG)) {
            // No need to show the login prompt, just open browser
            return true;
        }

        Log.d("Showing shouldOpenBrowser message");

        const BTN_OK = "OK";
        const BTN_DONT_SHOW = "OK, and hide this message";
        const openResponse = await vscode.window.showInformationMessage(
            "The browser will open to the ICP login page. Log in and open the URI when VS Code prompts you.",
            { modal: true },
            BTN_OK, BTN_DONT_SHOW
        );
        // Log.i("open is", openResponse);

        if (openResponse === BTN_OK) {
            return true;
        }
        else if (openResponse === BTN_DONT_SHOW) {
            Log.d("Not showing shouldOpenBrowser message any more");
            config.update(Settings.SHOW_OPEN_LOGIN_MSG, false);
            return true;
        }
        else {
            // they picked "cancel"
            return false;
        }
    }

    export async function getOpenIDConfig(icpHostname: string): Promise<IOpenIDConfig> {
        const openIDConfigUrl: string = `${getOIDCServerURL(icpHostname)}/.well-known/openid-configuration`;
        const oidcConfig: IOpenIDConfig = await request.get(openIDConfigUrl, {
            json: true,
            rejectUnauthorized: Requester.shouldRejectUnauthed(openIDConfigUrl),
            timeout: TIMEOUT,
        });
        // sanity check
        if (!oidcConfig.authorization_endpoint || !oidcConfig.token_endpoint) {
            Log.e(`Receieved bad OpenID config from ${openIDConfigUrl}`, oidcConfig);
        }
        return oidcConfig;
    }

    export function getRevokeEndpoint(icpHostname: string): string {
        return getOIDCServerURL(icpHostname) + OIDC_REVOKE_ENDPOINT;
    }

    function getOIDCServerURL(icpHostname: string): string {
        return `https://${icpHostname}:${OIDC_SERVER_PORT}${OIDC_SERVER_PATH}`;
    }
}

/**
 * See getOpenIDConfig(hostname)
 */
export interface IOpenIDConfig {
    // There are a lot more fields than this in the config object, but these are the ones we're interested in at this time
    token_endpoint: string;
    authorization_endpoint: string;

    grant_types_supported: string[];
    response_types_supported: string[];
}

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

export default AuthUtils;
