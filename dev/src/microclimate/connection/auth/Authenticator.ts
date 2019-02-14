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
import * as requestErrors from "request-promise-native/errors";
import * as qs from "querystring";
import * as crypto from "crypto";

import Log from "../../../Logger";
import * as MCUtil from "../../../MCUtil";
import Requester from "../../project/Requester";
import Connection from "../Connection";
import Commands from "../../../constants/Commands";
import PendingAuthentication from "./PendingAuthentication";
import AuthUtils, { IOpenIDConfig } from "./AuthUtils";
import TokenSetManager, { ITokenSet } from "./TokenSetManager";

namespace Authenticator {
    // microclimate-specific OIDC constants
    // See AuthUtils for more
    export const AUTH_REDIRECT_CB = "vscode://IBM.microclimate-tools/authcb";
    const OIDC_CLIENT_ID = "microclimate-tools";
    const OIDC_GRANT_TYPE = "authorization_code";

    /******
     * Buckle in - the authentication flow works as follows:
     * authenticate() is the entry point. Assembles the auth code request, and launches the browser to the auth code page.
     * authenticate() suspends by awaiting the pendingAuth promise, which will resolve after the user logs in.
     * The user logs in in the browser.
     * The auth code page calls back to the plugin. the vscode plugin URI handler calls handleAuthCallback,
     * which verifies the state parameter and fulfills the pendingAuth promise with the "code" query parameter from the server.
     * The callback uri with the auth code is then passed to onAuthCallback, which validates the state parameter
     * and exchanges the code for a tokenset at the token endpoint.
     * We save the access token and refresh token and include the access token in our requests to this ICP host.
     * We do NOT save, decrypt, or validate the id_token. We have no interest in the user data. For this reason, we don't use the `nonce` parameter.
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

    /**
     * Tries to get an OAuth access_token for the given ICP instance with the given credentials.
     * Throws an error if auth fails for any reason, or if the token response is not as excepted.
     * https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest
     */
    export async function authenticate(icpHostname: string): Promise<void> {
        Log.i("Authenticating against:", icpHostname);
        const openLoginResponse = await AuthUtils.shouldOpenBrowser();
        if (!openLoginResponse) {
            throw new Error(`Cancelled logging in to ${icpHostname}`);
        }
        if (pendingAuth != null) {
            fulfillPendingAuth(false, "Authentication cancelled - Multiple concurrent logins.");
        }

        // https://auth0.com/docs/protocols/oauth2/mitigate-csrf-attacks
        // Use hex because these characters have to be urlencoded
        const stateParam = crypto.randomBytes(16).toString("hex");
        // not used because we don't use the id_token
        // const nonceParam = crypto.randomBytes(16).toString("hex");
        const config: IOpenIDConfig = await AuthUtils.getOpenIDConfig(icpHostname);

        const authEndpoint: string = config.authorization_endpoint;
        const queryObj = {
            client_id: OIDC_CLIENT_ID,
            grant_type: OIDC_GRANT_TYPE,
            scope: AuthUtils.OIDC_SCOPE,
            response_type: "code",
            redirect_uri: AUTH_REDIRECT_CB,
            // nonce: nonceParam,
            state: stateParam,
        };
        Log.d("QUERYOBJ", queryObj);

        // convert the object to a querystring - but this will also urlencode it
        // unescape here and let URI encode below, to prevent double-encoding % signs.
        const query = qs.unescape(qs.stringify(queryObj));
        // at this point, query should NOT be escaped
        // URI will escape it
        const authUri = vscode.Uri.parse(authEndpoint).with({ query });

        const tokenEndpoint = config.token_endpoint;
        Log.d(`auth endpoint is: ${authUri}`);
        Log.d(`token endpoint is ${tokenEndpoint}`);

        vscode.commands.executeCommand(Commands.VSC_OPEN, authUri);

        pendingAuth = new PendingAuthentication(AUTH_REDIRECT_CB, stateParam);
        Log.d("Awaiting pending auth callback");

        const code: string = await pendingAuth.promise;
        await onAuthCallback(AUTH_REDIRECT_CB, tokenEndpoint, code);
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

        if (query.state == null) {
            return onCallbackError("No state parameter was provided by the authentication server");
        }
        else if (pendingAuth.state !== query.state) {
            return onCallbackError("State mismatch - Try restarting the authentication process.");
        }
        Log.d("State matches expected");

        if (query.code == null) {
            // don't print the code in any case
            // failure - only seen this with a misregistered client
            Log.e("No code parameter was provided by the authentication server");

            let errMsg = "Authentication failed";
            if (query.error || query.error_description) {
                errMsg += ": " + query.error_description || query.error_message;
            }
            return onCallbackError(errMsg);
        }

        fulfillPendingAuth(true, query.code.toString());
        // this resolves pendingAuth.promise in authenticate() above, so the auth process continues from there
    }

    function onCallbackError(errMsg: string): void {
        Log.e(errMsg);
        // vscode.window.showErrorMessage(errMsg);
        fulfillPendingAuth(false, errMsg);
    }

    /**
     * Resolve or reject the `pendingAuth` promise based on `success` and set `pendingAuth` to `undefined`.
     *
     * @param codeOrError - Auth code if `success=true`, error message if `success=false`.
     */
    function fulfillPendingAuth(success: boolean, codeOrError: string): void {
        if (pendingAuth == null) {
            Log.e("Can't fulfill pendingAuth because it is null");
            return;
        }

        if (success) {
            // code
            pendingAuth.resolve(codeOrError);
        }
        else {
            // error
            pendingAuth.reject(codeOrError);
        }
        pendingAuth = undefined;
    }

    /**
     * After receiving the auth code callback, send the code to the tokenEndpoint to receive an auth token in return.
     * https://openid.net/specs/openid-connect-core-1_0.html#TokenRequest
     */
    async function onAuthCallback(redirectUri: string, tokenEndpoint: string, code: string): Promise<void> {
        Log.d("onAuthCallback");
        const hostname = MCUtil.getHostnameFromAuthority(vscode.Uri.parse(tokenEndpoint).authority);

        try {
            const form = {
                client_id: OIDC_CLIENT_ID,
                grant_type: OIDC_GRANT_TYPE,
                redirect_uri: redirectUri,
                code: code,
            };
            // Log.i("form", form);

            Log.d("Trading code for tokenset, host is " + hostname);
            const tokenEndpointResponse: ITokenSet = await request.post(tokenEndpoint, {
                json: true,
                rejectUnauthorized: Requester.shouldRejectUnauthed(tokenEndpoint),
                form,
                timeout: AuthUtils.TIMEOUT,
            });

            await TokenSetManager.onNewTokenSet(hostname, tokenEndpointResponse);
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
        const tokenEndpoint = (await AuthUtils.getOpenIDConfig(hostname)).token_endpoint;
        const tokenSet = TokenSetManager.getTokenSetFor(hostname);
        if (tokenSet == null || tokenSet.refresh_token == null) {
            Log.e("Can't refresh - no refresh token available to connection " + connection);
            throw new Error("Refresh failed - Not logged in");
        }

        const form = {
            client_id: OIDC_CLIENT_ID,
            grant_type: "refresh_token",
            refresh_token: tokenSet.refresh_token,
            scope: AuthUtils.OIDC_SCOPE,
        };

        Log.d("Requesting token refresh now");
        const tokenEndpointResponse: ITokenSet = await request.post(tokenEndpoint, {
            json: true,
            rejectUnauthorized: Requester.shouldRejectUnauthed(tokenEndpoint),
            form,
            timeout: AuthUtils.TIMEOUT,
        });

        await TokenSetManager.onNewTokenSet(hostname, tokenEndpointResponse);
        Log.i("Successfully refreshed tokenset");
    }

    /**
     * Ask the cluster to revoke the tokens associated with this connection, then delete the tokens from the extension memory.
     * https://www.ibm.com/support/knowledgecenter/en/SSEQTP_liberty/com.ibm.websphere.wlp.doc/ae/twlp_oidc_revoke.html
     */
    export async function logout(connection: Connection): Promise<void> {
        const hostname = connection.host;
        Log.d("Log out of", hostname);
        const revokeEndpoint = AuthUtils.getRevokeEndpoint(hostname);
        Log.d("Log out endpoint is", revokeEndpoint);

        const existingTokenSet = TokenSetManager.getTokenSetFor(hostname);
        if (existingTokenSet != null) {
            // These tokens need to be revoked separately.
            const success = await Promise.all([
                requestRevoke(revokeEndpoint, existingTokenSet.access_token),
                requestRevoke(revokeEndpoint, existingTokenSet.refresh_token),
            ]);

            if (!success.every( (revokeResult) => revokeResult)) {
                // what could cause this?
                // should still delete tokens?
                throw new Error("Unknown error logging out");
            }

            Log.i("Logged out successfully");

            await TokenSetManager.setTokensFor(hostname, undefined);
        }
        else {
            // is this an error? any way to handle?
            Log.w("Logged out of a connection that had no tokens");
        }

        await connection.onDisconnect();
    }

    async function requestRevoke(revokeEndpoint: string, token: string): Promise<boolean> {
        const form = {
            client_id: OIDC_CLIENT_ID,
            token,
            // token_type_hint: tokenType,
        };

        const logoutResult: request.FullResponse = await request.post(revokeEndpoint, {
            form,
            followAllRedirects: true,
            resolveWithFullResponse: true,
            rejectUnauthorized: Requester.shouldRejectUnauthed(revokeEndpoint),
            timeout: AuthUtils.TIMEOUT,
        });

        const success = MCUtil.isGoodStatusCode(logoutResult.statusCode);
        if (!success) {
            // shouldn't happen
            Log.e("Error revoking token, revokeEndpoint is", revokeEndpoint);
        }
        else {
            // Log.d(`Revoked token`, token);
            Log.d(`Successfully revoked token`);
        }

        return success;
    }

    export function getAccessTokenForUrl(uri: vscode.Uri): string | undefined {
        const hostname = MCUtil.getHostnameFromAuthority(uri.authority);
        const tokenSet = TokenSetManager.getTokenSetFor(hostname);
        if (tokenSet == null) {
            return undefined;
        }
        return tokenSet.access_token;
    }
}

export default Authenticator;
