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

import Log from "../../Logger";
import * as MCUtil from "../../MCUtil";
import Requester from "../project/Requester";
import Connection from "./Connection";
import Commands from "../../constants/Commands";
import Settings from "../../constants/Settings";

namespace Authenticator {
    // for storing tokens in the ExtensionContext
    const TOKEN_PREFIX = "token-";

    export const AUTH_REDIRECT_CB = "vscode://IBM.microclimate-tools/authcb";
    const OIDC_CLIENT_ID = "microclimate-tools";
    const OIDC_GRANT_TYPE = "authorization_code";
    const OIDC_SCOPE = "openid";

    const TIMEOUT: number = 10000;

    /**
     * See getOpenIDConfig(hostname)
     */
    interface IOpenIDConfig {
        // There are a lot more fields than this in the config object, but these are the ones we're interested in at this time
        token_endpoint: string;
        authorization_endpoint: string;
        end_session_endpoint: string;

        grant_types_supported: string[];
        response_types_supported: string[];
    }

    /**
     * Tokenset received from OIDC /token endpoint
     */
    interface ITokenSet {
        access_token: string;
        refresh_token: string;
        token_type: string;         // eg "Bearer"
        expires_in: number;
        scope: string;
    }

    async function getOpenIDConfig(icpHostname: string): Promise<IOpenIDConfig> {
        const openIDConfigUrl: string = `https://${icpHostname}:8443/oidc/endpoint/OP/.well-known/openid-configuration`;
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

    /******
     * Buckle in - the authentication flow works as follows:
     * authenticate() is the entry point. Assembles the auth code request, and launches the browser to the auth code page.
     * authenticate() suspends by awaiting a promise which is resolved by resolvePendingAuth below.
     * The user logs in in the browser.
     * The auth code page calls back to the plugin. the vscode plugin URI handler calls handleAuthCallback,
     * which fulfills resolvePendingAuth promise with the response OIDC code from the server.
     * The code is then passed to onAuthCallback, which sends the code to the token endpoint and receives back a token set.
     * We save the access token and refresh token and include the access token in our requests to this ICP host.
     * logout() asks the server to revoke the current token, and deletes it from the extension's memory.
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
    let resolvePendingAuth: ( (code: string) => void ) | undefined;
    let rejectPendingAuth: ( () => void ) | undefined;

    /**
     * Tries to get an OAuth access_token for the given ICP instance with the given credentials.
     * Throws an error if auth fails for any reason, or if the token response is not as excepted.
     */
    export async function authenticate(icpHostname: string): Promise<void> {
        Log.i("Authenticating against:", icpHostname);
        const openLoginResponse = await shouldOpenBrowser();
        if (!openLoginResponse) {
            throw new Error(`Cancelled logging in to ${icpHostname}`);
        }

        const config: IOpenIDConfig = await getOpenIDConfig(icpHostname);

        const authEndpoint: string = config.authorization_endpoint;
        const queryObj = {
            client_id: OIDC_CLIENT_ID,
            grant_type: OIDC_GRANT_TYPE,
            scope: OIDC_SCOPE,
            response_type: "code",
            redirect_uri: AUTH_REDIRECT_CB,
            nonce: crypto.randomBytes(16).toString("base64"),
            // TODO
            // state:
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

        if (resolvePendingAuth != null) {
            // this is expected if the user opens the browser, doesn't log in, and then opens the browser again
            Log.w("Rejecting pending auth");
            if (rejectPendingAuth != null) {
                rejectPendingAuth();
            }
        }

        // this promise is resolved in handleAuthCallback below
        const pendingAuthPromise = new Promise<string>((resolve, reject) => {
            resolvePendingAuth = resolve;
            rejectPendingAuth = reject;
        });
        Log.d("Awaiting pending auth callback");

        let code: string;
        try {
            code = await pendingAuthPromise;
        }
        catch (err) {
            // catch this to fail quietly, since the user is doing a new auth flow
            Log.i(`Auth to ${icpHostname} cancelled`);
            return;
        }
        await onAuthCallback(AUTH_REDIRECT_CB, tokenEndpoint, code);
    }

    async function shouldOpenBrowser(): Promise<boolean> {
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
    export function handleAuthCallback(uri: vscode.Uri): void {
        // don't print the code
        Log.i("Received auth callback from " + uri.authority);
        const query = qs.parse(uri.query);
        if (query.code == null) {
            Log.e("Got an auth callback but no code, that doesn't make any sense!");
            return;
        }

        // remove the code from the redirect uri so it matches the one we got the code with
        if (resolvePendingAuth == null) {
            Log.e("Received callback but no pending auth to resolve");
            return;
        }
        resolvePendingAuth(query.code.toString());
        resolvePendingAuth = undefined;
        Log.d("Resolved pending auth");
        // the auth process continues with the fulfillment of pendingAuthPromise in authenticate() above
    }

    async function onAuthCallback(redirectUri: string, tokenEndpoint: string, code: string): Promise<void> {
        Log.d("onAuthCallback");
        const icpHostname = MCUtil.getHostnameFromAuthority(vscode.Uri.parse(tokenEndpoint).authority);

        try {
            const form = {
                client_id: OIDC_CLIENT_ID,
                grant_type: OIDC_GRANT_TYPE,
                redirect_uri: redirectUri,
                code: code,
            };
            // Log.i("form", form);

            Log.d("Trading code for tokenset, host is " + icpHostname);
            const tokenSet: ITokenSet = await request.post(tokenEndpoint, {
                json: true,
                rejectUnauthorized: Requester.shouldRejectUnauthed(tokenEndpoint),
                form,
                timeout: TIMEOUT,
            });

            if (!validateTokenSet(tokenSet)) {
                Log.e("New TokenSet was not as expected!", tokenSet);
                throw new Error("Received unexpected response from authentication request.");
            }

            Log.i(`Successfully got tokenset!`);
            await setTokensFor(icpHostname, tokenSet);
        }
        catch (err) {
            let authFailedDetail: string | undefined;

            if (err instanceof requestErrors.StatusCodeError) {
                // Try to handle all the "normal" errors here, so we can provide better messages
                if (err.error && err.error.error_description) {
                    const desc: string = err.error.error_description.toString();
                    if (desc.includes("CWOAU0025E")) {
                        authFailedDetail = `The authentication server does not support the required grant type. ` +
                            `Make sure that your version of Microclimate is **new enough** and you've opened it at least once ?`;
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

            const authFailedMsg: string = `Failed to authenticate against ${icpHostname}.\n${authFailedDetail}`;
            // Log.d("Reporting auth failure with message:", authFailedMsg);
            throw new Error(authFailedMsg);
        }
    }

    function validateTokenSet(tokenSet: ITokenSet): boolean {
        return tokenSet.access_token != null &&
            tokenSet.token_type != null &&
            tokenSet.token_type.toLowerCase() === "bearer" &&
            tokenSet.refresh_token != null;
    }

    export async function refreshToken(connection: Connection): Promise<void> {
        const hostname = connection.host;
        Log.i("Refreshing token of " + hostname);
        const tokenEndpoint = (await getOpenIDConfig(hostname)).token_endpoint;
        const tokenSet = getTokenSetFor(hostname);
        if (tokenSet == null || tokenSet.refresh_token == null) {
            Log.e("Can't refresh - no refresh token available to connection " + connection);
            throw new Error("Refresh failed - Not logged in");
        }

        const form = {
            client_id: OIDC_CLIENT_ID,
            grant_type: "refresh_token",
            refresh_token: tokenSet.refresh_token,
            scope: OIDC_SCOPE,
        };

        Log.d("Requesting token refresh now");
        const newTokenSet: ITokenSet = await request.post(tokenEndpoint, {
            json: true,
            rejectUnauthorized: Requester.shouldRejectUnauthed(tokenEndpoint),
            form,
            timeout: TIMEOUT,
        });

        if (!validateTokenSet(tokenSet)) {
            Log.e("Refreshed TokenSet was not as expected!", tokenSet);
            throw new Error("Received unexpected response from refresh request.");
        }

        Log.i("Successfully refreshed tokenset");
        await setTokensFor(hostname, newTokenSet);
    }

    export async function logout(connection: Connection): Promise<void> {
        const hostname = connection.host;
        Log.d("Log out of", hostname);
        const logoutEndpoint = (await getOpenIDConfig(hostname)).end_session_endpoint;
        Log.d("Log out endpoint is", logoutEndpoint);

        const existingTokenSet = getTokenSetFor(hostname);
        if (existingTokenSet != null) {
            const form = {
                token: existingTokenSet.access_token,
                token_type_hint: "access_token"
            };
            const logoutResult: request.FullResponse = await request.post(logoutEndpoint, {
                form,
                followAllRedirects: true,
                resolveWithFullResponse: true,
                rejectUnauthorized: Requester.shouldRejectUnauthed(logoutEndpoint),
                timeout: TIMEOUT,
            });
            if (!MCUtil.isGoodStatusCode(logoutResult.statusCode)) {
                // Don't know what could cause this - even if the token is invalid or anything, server should still return 200
                Log.w(`Bad status ${logoutResult.statusCode} after logging out`, logoutResult.body);
            }
            else {
                Log.d("Logged out successfully");
            }
            await setTokensFor(hostname, undefined);
        }

        await connection.onDisconnect();
    }

    export function getAccessTokenForUrl(uri: vscode.Uri): string | undefined {
        const tokenSet = getTokenSetFor(MCUtil.getHostnameFromAuthority(uri.authority));
        if (tokenSet == null) {
            return undefined;
        }
        return tokenSet.access_token;
    }

    function getTokenSetFor(hostname: string): ITokenSet | undefined {
        const key = TOKEN_PREFIX + hostname;
        const memento = global.extGlobalState as vscode.Memento;
        const tokenSet = memento.get<ITokenSet>(key);
        if (!tokenSet) {
            Log.i("no token for hostname:", hostname);
            return undefined;
        }
        return tokenSet;
    }

    async function setTokensFor(hostname: string, newTokens: ITokenSet | undefined): Promise<void> {
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
}

export default Authenticator;
