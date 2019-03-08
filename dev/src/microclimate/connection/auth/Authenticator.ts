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
// import * as request from "request-promise-native";
// import * as requestErrors from "request-promise-native/errors";
import * as qs from "querystring";
import { Issuer } from "openid-client";

import Log from "../../../Logger";
import * as MCUtil from "../../../MCUtil";
// import Requester from "../../project/Requester";
// import Connection from "../Connection";
import Commands from "../../../constants/Commands";
import PendingAuthentication from "./PendingAuthentication";
import AuthUtils from "./AuthUtils";
import Requester from "../../project/Requester";
import ICPInfoMap from "../ICPInfoMap";

namespace Authenticator {
    // OAuth config
    const OAUTH_SCOPE = "openid";
    const OAUTH_GRANT_TYPE = "implicit";
    const OAUTH_RESPONSE_TYPE = "token";
    // microclimate-specific OIDC constants
    // See AuthUtils for more
    // These must match the values registered with the OIDC server by Portal
    export const AUTH_REDIRECT_CB = "vscode://IBM.microclimate-tools/authcb";
    export const CLIENT_ID = "microclimate-tools";

    /******
     * We use the OAuth 2.0 implicit authentication flow. We do not use OIDC because we don't need an id_token.
     * This has the advantage of not requiring a client_secret,
     * and also not requiring a reconfiguration of the Liberty OIDC provider to allow public clients.
     * The drawback is that the implicit flow does not provide a refresh_token.
     * Refer to:
     * - https://tools.ietf.org/html/rfc6749#section-4.2
     * - https://openid.net/specs/openid-connect-core-1_0.html#ImplicitAuthorizationEndpoint
     * - https://auth0.com/docs/api-auth/tutorials/implicit-grant provides friendlier examples, but with some details that are not relevant here.
     * - Portal code which registers the ide plugins as an OIDC client in `authentication/oidc_register_plugins.js`.
     * - openid-client library, https://github.com/panva/node-openid-client
     *
     * authenticate() is the entry point. Assembles the auth code request, and launches the browser to the auth code page.
     * authenticate() suspends by awaiting the pendingAuth promise, which will resolve after the user logs in.
     * The user logs in in the browser.
     * The auth code page calls back to the plugin. the vscode plugin URI handler calls handleAuthCallback,
     * which verifies the state parameter and fulfills the pendingAuth promise with the tokenset received.
     * We save the access token and include it in our requests to this ICP host.
     * logout() asks the server to revoke the current access token, and deletes it from the extension's memory.
    *******/
    let pendingAuth: PendingAuthentication | undefined;

    /**
     * Tries to get an OAuth access_token for the given ICP instance with the given credentials.
     * Throws an error if auth fails for any reason, or if the token response is not as excepted.
     * See references above.
     */
    export async function authenticate(icpMasterIP: string): Promise<void> {
        Log.i("Authenticating against:", icpMasterIP);
        const openLoginResponse = await AuthUtils.shouldOpenBrowser();
        if (!openLoginResponse) {
            throw new Error(`Cancelled logging in to ${icpMasterIP}`);
        }
        if (pendingAuth != null) {
            rejectPendingAuth("Previous login cancelled - Multiple concurrent logins.");
        }

        const oidcServerUrl: string = AuthUtils.getOIDCServerURL(icpMasterIP).toString();
        Log.d("OIDC server is at " + oidcServerUrl);

        Issuer.defaultHttpOptions = {
            timeout: AuthUtils.TIMEOUT,
            rejectUnauthorized: Requester.shouldRejectUnauthed(oidcServerUrl),
        };
        const icpIssuer = await Issuer.discover(oidcServerUrl);
        const openIDClient = new icpIssuer.Client({
            client_id: CLIENT_ID,
        });

        // https://auth0.com/docs/protocols/oauth2/mitigate-csrf-attacks
        const stateParam = AuthUtils.getCryptoRandomHex();
        // https://auth0.com/docs/api-auth/tutorials/nonce
        const nonceParam = AuthUtils.getCryptoRandomHex();

        const authUrlStr: string = openIDClient.authorizationUrl({
            redirect_uri: AUTH_REDIRECT_CB,
            scope: OAUTH_SCOPE,
            grant_type: OAUTH_GRANT_TYPE,
            response_type: OAUTH_RESPONSE_TYPE,
            state: stateParam,
            nonce: nonceParam,
        });

        Log.d(`auth endpoint is: ${authUrlStr}`);

        const authUrl: vscode.Uri = vscode.Uri.parse(authUrlStr);
        vscode.commands.executeCommand(Commands.VSC_OPEN, authUrl);

        pendingAuth = new PendingAuthentication(icpMasterIP, stateParam, nonceParam, openIDClient);

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
            title: "Waiting for browser login..."
        }, (_progress, token): Promise<void> => {
            token.onCancellationRequested((_e) => {
                rejectPendingAuth("Cancelled browser login");
            });

            if (pendingAuth == null) {
                // never
                return Promise.reject();
            }
            return pendingAuth.promise;
        });
        Log.d("Auth callback now pending");
        // Return this promise - We don't want this function's returned promise to resolve until this one does,
        // or the connection process may continue before authentication is complete.
        return pendingAuth.promise;
    }

    /**
     * Called by the extension URI handler when the AUTH_CALLBACK_URI is requested.
     * Validates the callback parameters, then resolves the pendingAuth promise with the received code.
     * https://tools.ietf.org/html/rfc6749#section-4.2.2
     *
     * @param uri The full callback uri, which must match the redirect_uri given to the authorization endpoint above.
     *
     * Cannot throw errors up to the uri handler - must display any message here.
     */
    export async function handleAuthCallback(uri: vscode.Uri): Promise<void> {
        if (pendingAuth == null) {
            // won't happen
            Log.e("handling auth callback but no pendingAuth is set");
            return;
        }

        Log.i("Received auth callback");
        try {
            const fragment = uri.fragment;
            const responseObj = qs.parse(fragment);

            // validation checks for the openid client library to perform
            const checks = {
                state: pendingAuth.state,
                // I don't know why nonce is required - There's no id_token so what is it used for?
                nonce: pendingAuth.nonce,
                response_type: OAUTH_RESPONSE_TYPE,
            };
            // will throw error if checks fail
            const authCallbackResult: any = await pendingAuth.openIDClient.authorizationCallback(AUTH_REDIRECT_CB, responseObj, checks);
            Log.d("Auth callback checks passed, result:", authCallbackResult);

            const tokenSet: ITokenSet = {
                access_token: authCallbackResult.access_token,
                token_type: authCallbackResult.token_type,
                expires_at: authCallbackResult.expires_at * 1000,       // s -> ms
            };

            await setTokensFor(pendingAuth.masterIP, tokenSet);

            const expiryDate = (new Date(tokenSet.expires_at)).toLocaleString();
            // success!
            vscode.window.showInformationMessage(`Successfully authenticated against ${pendingAuth.masterIP}.` +
                `\nExpires at ${expiryDate}.`);

            pendingAuth.resolve();
            pendingAuth = undefined;
        }
        catch (err) {
            rejectPendingAuth(err);
        }
    }

    /**
     * Helper function to call if a pending auth fails (or is cancelled) for any reason.
     */
    function rejectPendingAuth(err: string): void {
        if (pendingAuth == null) {
            Log.e("Can't fulfill pendingAuth because it is null");
            return;
        }
        pendingAuth.reject(err);
        pendingAuth = undefined;
    }

    ///// TokenSet funcs

    const TOKEN_PREFIX = "token-";

    export function getTokensetFor(url: vscode.Uri): ITokenSet | undefined {
        if (MCUtil.isLocalhost(url.authority)) {
            return undefined;
        }
        const masterIP = ICPInfoMap.getMasterIP(url);
        if (masterIP == null) {
            Log.e("No master IP for " + url);
            return undefined;
        }

        const key = TOKEN_PREFIX + masterIP;
        const memento = global.extGlobalState as vscode.Memento;
        const tokenSet = memento.get<ITokenSet>(key);
        if (!tokenSet) {
            Log.i("no token for master:", masterIP);
            return undefined;
        }
        return tokenSet;
    }

    export async function clearTokensFor(ingressUrl: vscode.Uri): Promise<void> {
        Log.d("clearTokensFor " + ingressUrl);
        const masterIP = ICPInfoMap.getMasterIP(ingressUrl);
        if (masterIP == null) {
            Log.e("No master IP for ingress " + ingressUrl);
            return;
        }

        return setTokensFor(masterIP, undefined);
    }

    async function setTokensFor(masterIP: string, newTokens: ITokenSet | undefined): Promise<void> {
        const key = TOKEN_PREFIX + masterIP;
        const memento = global.extGlobalState as vscode.Memento;
        await memento.update(key, newTokens);
        if (newTokens != null) {
            // at the time of writing, expires_in is 12 hours in seconds
            Log.i(`Updated token for ${masterIP}, new token expires at ${newTokens.expires_at}`);
        }
        else {
            Log.d(`Cleared token for ${masterIP}`);
        }
    }
}

/**
 * Tokenset received from token endpoint when using the implicit flow.
 * Other flows may also feature refresh_token, id_token, and scope.
 */
export interface ITokenSet {
    readonly access_token: string;
    readonly token_type: string;        // expected to be "Bearer"
    readonly expires_at: number;        // in millis - need to use simple type here so Context can save it - Date doesn't work.
}

export default Authenticator;
