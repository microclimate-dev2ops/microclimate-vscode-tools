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

import Log from "../../../Logger";
import * as MCUtil from "../../../MCUtil";
// import Requester from "../../project/Requester";
// import Connection from "../Connection";
import Commands from "../../../constants/Commands";
import PendingAuthentication from "./PendingAuthentication";
import AuthUtils, { IOpenIDConfig } from "./AuthUtils";
import TokenSetManager, { ITokenSet } from "./TokenSetManager";

namespace Authenticator {
    // microclimate-specific OIDC constants
    // See AuthUtils for more
    // These must match the values registered with the OIDC server by Portal
    export const AUTH_REDIRECT_CB = "vscode://IBM.microclimate-tools/authcb";
    export const CLIENT_ID = "microclimate-tools";
    const OAUTH_SCOPE = "openid";
    const OAUTH_GRANT_TYPE = "implicit";
    const OAUTH_RESPONSE_TYPE = "token";

    /******
     * We use the OAuth 2.0 implicit authentication flow. We do not use OIDC because we don't need an id_token.
     * This has the advantage of not requiring a client_secret,
     * and also not requiring a reconfiguration of the Liberty OIDC provider to allow public clients.
     * The drawback is that the implicit flow does not provide a refresh_token.
     * Refer to:
     * - https://tools.ietf.org/html/rfc6749 - In particular, section 4.2.
     * - https://auth0.com/docs/api-auth/tutorials/implicit-grant provides friendlier examples, but with some details that are not relevant here.
     * - Portal code which registers the ide plugins as an OIDC client in `authentication/oidc_register_plugins.js`.
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
     * https://openid.net/specs/openid-connect-core-1_0.html#AuthRequest
     */
    export async function authenticate(icpHostname: string): Promise<void> {
        Log.i("Authenticating against:", icpHostname);
        const openLoginResponse = await AuthUtils.shouldOpenBrowser();
        if (!openLoginResponse) {
            throw new Error(`Cancelled logging in to ${icpHostname}`);
        }
        if (pendingAuth != null) {
            rejectPendingAuth("Previous login cancelled - Multiple concurrent logins.");
        }

        // https://auth0.com/docs/protocols/oauth2/mitigate-csrf-attacks
        const stateParam = AuthUtils.getCryptoRandomHex();
        const oidcConfig: IOpenIDConfig = await AuthUtils.getOpenIDConfig(icpHostname);

        const authEndpoint: string = oidcConfig.authorization_endpoint;
        const queryObj = {
            client_id: CLIENT_ID,
            grant_type: OAUTH_GRANT_TYPE,
            scope: OAUTH_SCOPE,
            response_type: OAUTH_RESPONSE_TYPE,
            redirect_uri: AUTH_REDIRECT_CB,
            state: stateParam,
        };
        // Log.d("QUERYOBJ", queryObj);

        // convert the object to a querystring - but this will also urlencode it
        // unescape here and let URI encode below, to prevent double-encoding % signs.
        const query = qs.unescape(qs.stringify(queryObj));
        // at this point, query should NOT be escaped
        // URI will escape it
        const authUri = vscode.Uri.parse(authEndpoint).with({ query });
        Log.d(`auth endpoint is: ${authUri}`);

        vscode.commands.executeCommand(Commands.VSC_OPEN, authUri);

        pendingAuth = new PendingAuthentication(stateParam);

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
            title: "Waiting for browser login..."
        }, (_progress, token): Promise<ITokenSet> => {
            token.onCancellationRequested((_e) => {
                rejectPendingAuth("Cancelled browser login");
            });

            if (pendingAuth == null) {
                // never
                return Promise.reject();
            }
            return pendingAuth.promise;
        });
        Log.d("Awaiting pending auth callback");

        const tokenSet: ITokenSet = await pendingAuth.promise;
        await TokenSetManager.setTokensFor(icpHostname, tokenSet);
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
    export function handleAuthCallback(uri: vscode.Uri): void {
        if (pendingAuth == null) {
            // won't happen
            Log.e("handling auth callback but no pendingAuth is set");
            return;
        }

        Log.i("Received auth callback");
        const fragment = uri.fragment;
        const responseObj = qs.parse(fragment);

        const error = responseObj.error_description || responseObj.error;
        if (error) {
            // failure - only seen this with a misregistered client
            Log.e("No code parameter was provided by the authentication server");

            const errMsg = "Authentication failed: " + error;
            return onCallbackError(errMsg);
        }

        if (responseObj.state == null) {
            return onCallbackError("No state parameter was provided by the authentication server");
        }
        else if (pendingAuth.state !== responseObj.state) {
            return onCallbackError("State mismatch - Try restarting the authentication process.");
        }
        Log.d("State matches expected");
        // don't need this anymore
        delete responseObj.state;

        // since there were no errors above, we can treat the response as a tokenset now
        const tokenSet = responseObj as unknown as ITokenSet;
        if (tokenSet.token_type.toLowerCase() !== "bearer") {
            return onCallbackError("Received unexpected token from authentication server");
        }
        // success!
        pendingAuth.resolve(tokenSet);
        pendingAuth = undefined;
        // this resolves pendingAuth.promise in authenticate() above, so the auth process continues from there
    }

    function onCallbackError(errMsg: string): void {
        Log.e(errMsg);
        // vscode.window.showErrorMessage(errMsg);
        rejectPendingAuth(errMsg);
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

    /**
     * Ask the cluster to revoke the tokens associated with this connection, then delete the tokens from the extension memory.
     * https://tools.ietf.org/html/rfc7009#section-2.1
     * https://www.ibm.com/support/knowledgecenter/en/SSEQTP_liberty/com.ibm.websphere.wlp.doc/ae/twlp_oidc_revoke.html
     */
    // Commented out because the Liberty implementation does not allow this with the implicit flow - might just be a bug
    /*
    export async function logout(connection: Connection): Promise<void> {
        const hostname = connection.host;
        Log.d("Log out of", hostname);
        const revokeEndpoint = (await AuthUtils.getOpenIDConfig(hostname)).revoke_endpoint;
        Log.d("Log out endpoint is", revokeEndpoint);

        const existingTokenSet = TokenSetManager.getTokenSetFor(hostname);
        if (existingTokenSet != null) {
            // These tokens need to be revoked separately.
            const success = await Promise.all([
                requestRevoke(revokeEndpoint, existingTokenSet.access_token)
                // add refresh_token here, if/when we start using that again
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
    }

    async function requestRevoke(revokeEndpoint: string, token: string): Promise<boolean> {
        const form = {
            client_id: CLIENT_ID,
            client_secret: "",
            token,
            // token_type_hint: tokenType,
        };

        const logoutResult: request.FullResponse = await request.post(revokeEndpoint, {
            form,
            json: true,
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
    }*/

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
