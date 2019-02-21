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
import * as requestErrors from "request-promise-native/errors";
import * as qs from "querystring";
import * as crypto from "crypto";
import { Issuer } from "openid-client";

import Log from "../../../Logger";
import * as MCUtil from "../../../MCUtil";
import Requester from "../../project/Requester";
import Connection from "../Connection";
import Commands from "../../../constants/Commands";
import PendingAuthentication, { IAuthCallbackParams } from "./PendingAuthentication";
import TokenSetManager, { ITokenSet } from "./TokenSetManager";
import Settings from "../../../constants/Settings";

namespace Authenticator {
    const OIDC_SERVER_PORT = 8443;
    const OIDC_SERVER_PATH = "/oidc/endpoint/OP";

    // microclimate-specific OIDC constants
    // See AuthUtils for more
    // These must match the values registered with the OIDC server by Portal
    export const AUTH_REDIRECT_CB = "vscode://IBM.microclimate-tools/authcb";
    export const OIDC_CLIENT_ID = "microclimate-tools";
    const OIDC_GRANT_TYPE = "authorization_code";

    /******
     * Buckle in - the authentication flow works as follows:
     * authenticate() is the entry point. Assembles the auth code request, and launches the browser to the auth code page.
     * authenticate() suspends by awaiting the pendingAuth promise, which will resolve after the user logs in.
     * The user logs in in the browser.
     * The auth code page calls back to the plugin. the vscode plugin URI handler calls handleAuthCallback,
     * which verifies the state parameter and fulfills the pendingAuth promise with the "code" (aka auth code) query parameter from the server.
     * The callback uri, auth code, and state parameter are then passed to getToken, which validates the state parameter
     * and exchanges the code for a tokenset at the token endpoint.
     * We save the access token and refresh token and include the access token in our requests to this ICP host.
     * At this time the id_token is validated by the tools, but not stored.
     * logout() asks the server to revoke the current tokens, and deletes them from the extension's memory.
     *
     * The OIDC Liberty server must be configured to allow public clients (ie, ones that do not use a secret).
     * <oauthProvider> tag must have the attribute allowPublicClients=true.
     * This server is in the platform-auth-service container which runs in the `auth-idp-xxxx` pod in the `kube-system`.
     * Edit /opt/ibm/wlp/usr/servers/defaultServer/server.xml and the server will restart, then this flow will work.
     *
     * Refer to:
     * - OIDC spec: https://openid.net/specs/openid-connect-core-1_0.html
     * - OAuth RFC: https://tools.ietf.org/html/rfc6749
     * - Portal code which registers the ide plugins as an OIDC client in authentication/oidc.js
    *******/
    let pendingAuth: PendingAuthentication | undefined;

    async function getOpenIDClient(icpHostname: string): Promise<any> {
        const icpIssuer = await Issuer.discover( `https://${icpHostname}:${OIDC_SERVER_PORT}${OIDC_SERVER_PATH}`, {
            rejectUnauthorized: Requester.shouldRejectUnauthed(icpHostname)
        });

        return new icpIssuer.Client({
            client_id: OIDC_CLIENT_ID,
            token_endpoint_auth_method: "none",
        });
    }

    /**
     * Tries to get an OAuth access_token for the given ICP instance with the given credentials.
     * Throws an error if auth fails for any reason, or if the token response is not as excepted.
     * https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest
     */
    export async function authenticate(icpHostname: string): Promise<void> {
        Log.i("Authenticating against:", icpHostname);
        const openLoginResponse = await shouldOpenBrowser();
        if (!openLoginResponse) {
            throw new Error(`Cancelled logging in to ${icpHostname}`);
        }
        if (pendingAuth != null) {
            rejectPendingAuth("Previous login cancelled - Multiple concurrent logins.");
        }

        const openIDClient = await getOpenIDClient(icpHostname);
        // custom field
        openIDClient.hostname = icpHostname;

        const responseType = "code";
        // https://auth0.com/docs/protocols/oauth2/mitigate-csrf-attacks
        const stateParam = getCryptoRandomHex();
        // https://auth0.com/docs/api-auth/tutorials/nonce
        const nonceParam = getCryptoRandomHex();

        const authUrl = openIDClient.authorizationUrl({
            redirect_uri: AUTH_REDIRECT_CB,
            scope: "openid",
            grant_type: OIDC_GRANT_TYPE,
            response_type: responseType,
            nonce: nonceParam,
            state: stateParam,
        });
        Log.d(`auth endpoint is: ${authUrl}`);

        vscode.commands.executeCommand(Commands.VSC_OPEN, authUrl);

        pendingAuth = new PendingAuthentication(AUTH_REDIRECT_CB);

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
            title: "Waiting for browser login"
        }, (_progress, token): Promise<IAuthCallbackParams> => {
            if (pendingAuth == null) {
                // never
                return Promise.reject();
            }
            token.onCancellationRequested((_e) => {
                rejectPendingAuth("Cancelled browser login");
            });
            return pendingAuth.promise;
        });
        Log.d("Awaiting pending auth callback");

        const checks = {
            state: stateParam,
            nonce: nonceParam,
            response_type: responseType
        };

        const cbParams: IAuthCallbackParams = await pendingAuth.promise;
        await getTokens(AUTH_REDIRECT_CB, checks, cbParams, openIDClient);
    }

    /**
     * Called by the extension URI handler when the AUTH_CALLBACK_URI is requested.
     * Validates the callback parameters, then resolves the pendingAuth promise with the received code.
     * https://openid.net/specs/openid-connect-core-1_0.html#AuthResponse
     *
     * @param uri The full callback uri, which must match the redirect_uri given to the authorization endpoint above.
     *
     * Cannot throw errors up to the uri handler - must display any message here.
     */
    export function handleAuthCallback(uri: vscode.Uri): void {
        if (pendingAuth == null) {
            // won't happen
            Log.e("handling auth callback but no pendingAuth is set");
            return;
        }

        Log.i("Received auth callback, uri is: " + uri);
        const query = qs.parse(uri.query);
        if (query.code == null || Array.isArray(query.code) || query.state == null || Array.isArray(query.state)) {
            return rejectPendingAuth(`OIDC server provided an invalid query in the callback URI ${uri}`);
        }

        pendingAuth.resolve({ code: query.code, state: query.state });
        pendingAuth = undefined;
        // this resolves pendingAuth.promise in authenticate() above, so the auth process continues from there
    }

    function rejectPendingAuth(err: string): void {
        if (pendingAuth == null) {
            Log.e("Can't fulfill pendingAuth because it is null");
            return;
        }

        pendingAuth.reject(err);
        pendingAuth = undefined;
    }

    /**
     * After receiving the auth code callback, send the code to the tokenEndpoint to receive an auth token in return.
     * https://openid.net/specs/openid-connect-core-1_0.html#TokenRequest
     */
    async function getTokens(
        redirectUri: string,
        checks: { state: string, nonce: string, response_type: string},
        cbParams: IAuthCallbackParams,
        openIDClient: any): Promise<void> {

        Log.d("onAuthCallback");
        const hostname = openIDClient.hostname;
        Log.d(`hostname=${hostname}`);

        try {
            const tokenSet: ITokenSet = await openIDClient.authorizationCallback(redirectUri, cbParams, checks);
            // tokenset is validated by the openid-client library

            await TokenSetManager.onNewTokenSet(hostname, tokenSet);
            Log.i(`Successfully got new tokenset from code`);
        }
        catch (err) {
            let authFailedDetail: string | undefined;

            if (err instanceof requestErrors.StatusCodeError) {
                // Try to handle all the "normal" errors here, so we can provide better messages
                if (err.error && err.error.error_description) {
                    const desc: string = err.error.error_description.toString();
                    if (desc.includes("CWOAU0025E")) {
                        authFailedDetail = `The authentication server does not support the required grant type. ` +
                            `Make sure that your version of Microclimate is at least 19.3 probably.`;
                    }
                }
            }

            if (!authFailedDetail) {
                Log.w("Unexpected authentication error", err);
                authFailedDetail = err.error_description || err.error || err.message || err.toString();
            }
            else {
                Log.i("Handled authentication error", err);
            }

            const authFailedMsg: string = `Failed to authenticate against ${hostname}.\n${authFailedDetail}`;
            // Log.d("Reporting auth failure with message:", authFailedMsg);
            throw new Error(authFailedMsg);
        }
    }

    /**
     * Exchange the refresh_token for a new tokenset to prevent expiry.
     * https://openid.net/specs/openid-connect-core-1_0.html#RefreshingAccessToken
     */
    export async function refreshToken(connection: Connection): Promise<void> {
        const hostname = connection.host;
        Log.i("Refreshing token of " + hostname);
        const tokenSet = TokenSetManager.getTokenSetFor(hostname);
        if (tokenSet == null || tokenSet.refresh_token == null) {
            Log.e("Can't refresh - no refresh token available to connection " + connection);
            throw new Error("Refresh failed - Not logged in");
        }

        const openIDClient = await getOpenIDClient(hostname);
        const newTokenSet = await openIDClient.refresh(tokenSet);

        await TokenSetManager.onNewTokenSet(hostname, newTokenSet);

        Log.i("Successfully refreshed tokenset");
    }

    /**
     * Ask the cluster to revoke the tokens associated with this connection, then delete the tokens from the extension memory.
     * https://www.ibm.com/support/knowledgecenter/en/SSEQTP_liberty/com.ibm.websphere.wlp.doc/ae/twlp_oidc_revoke.html
     */
    export async function logout(connection: Connection): Promise<void> {
        const hostname = connection.host;
        Log.d("Log out of", hostname);
        const openIDClient = await getOpenIDClient(hostname);

        const existingTokenSet = TokenSetManager.getTokenSetFor(hostname);
        if (existingTokenSet != null) {
            // These tokens need to be revoked separately.
            await Promise.all([
                openIDClient.revoke(existingTokenSet.access_token),
                openIDClient.revoke(existingTokenSet.refresh_token),
            ]);

            Log.i("Logged out successfully");

            await TokenSetManager.setTokensFor(hostname, undefined);
        }
        else {
            // is this an error? any way to handle?
            Log.w("Logged out of a connection that had no tokens");
        }
    }

    export function getAccessTokenForUrl(uri: vscode.Uri): string | undefined {
        const hostname = MCUtil.getHostnameFromAuthority(uri.authority);
        const tokenSet = TokenSetManager.getTokenSetFor(hostname);
        if (tokenSet == null) {
            return undefined;
        }
        return tokenSet.access_token;
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

    /**
     * Returns a 16-byte hex string, suitable for use as a `nonce` or `state`.
     * Use hex because these characters have to be urlencoded.
     */
    export function getCryptoRandomHex(): string {
        return crypto.randomBytes(16).toString("hex");
    }
}

export default Authenticator;
