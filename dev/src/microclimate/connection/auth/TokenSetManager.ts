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
import * as crypto from "crypto";

import Log from "../../../Logger";
import AuthUtils from "./AuthUtils";
import Authenticator from "./Authenticator";

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

// From https://openid.net/specs/openid-connect-core-1_0.html 3.1.3.7 step 7, this is the default 'alg'
const EXPECTED_JWT_ALG = "RS256";
// The name to pass to crypto.createHash that matches the EXPECTED_JWT_ALG
const JWT_ALG_CRYPTO_NAME = "sha256";

/**
 * https://en.wikipedia.org/wiki/JSON_Web_Token#Structure
 */
interface IJWTHeader {
    alg: string;
    // typ: string;     // seems to be absent from ICP
}

/**
 * https://en.wikipedia.org/wiki/JSON_Web_Token#Standard_fields
 */
interface IJWTPayload {
    iss: string;            // "https://mycluster.icp:9443/oidc/endpoint/OP"
    sub: string;            // username, eg "admin"
    aud: string;            // "microclimate-tools"
    exp: number;            // unix timestamp (expiry)
    iat: number;            // unix timestamp (issued at)
    at_hash: string;        // used to validate access_token https://openid.net/specs/openid-connect-core-1_0.html#ImplicitTokenValidation
    nonce: string;          // required because we always provide one to the server
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

    export async function onNewTokenSet(hostname: string, newTokenSet: ITokenSet, nonce: string, issuer: string): Promise<void> {
        validateTokenSet(newTokenSet, nonce, issuer);
        // At this time, there's no reason for us to store the id_token once it's been validated.
        delete newTokenSet.id_token;

        // REMOVE
        Log.d("TOKENSET!", newTokenSet);
        await setTokensFor(hostname, newTokenSet);
    }

    /**
     * Returns normally if the tokenset is valid.
     * Throws an error if the tokenset is not valid according to the spec, or is missing values.
     */
    function validateTokenSet(tokenSet: ITokenSet, nonce: string, issuer: string): void {
        Log.d("Validating new tokenset");

        // Trivial validation - Ensure everything we expect to be present, is
        if (tokenSet.access_token == null ||
            tokenSet.token_type == null ||
            tokenSet.token_type.toLowerCase() !== "bearer" ||
            tokenSet.refresh_token == null ||
            tokenSet.id_token == null ||
            tokenSet.scope.includes(AuthUtils.OIDC_SCOPE)) {

            const errMsg = "TokenSet was missing expected value(s)";
            // Don't log the tokenset.
            throw new Error(errMsg);
        }

        // Now we pick apart the id_token and validate it, as well as validating the access_token matches the id_token.
        // See the OIDC token validation docs linked below.

        // https://en.wikipedia.org/wiki/JSON_Web_Token#Structure
        // The JWT id_token has 3 parts, header, payload, and signature, separated by periods '.' See link above for explanation.
        const headerEndIndex = tokenSet.id_token.indexOf(".");
        const idTokenHeaderStr = decodeJWTPart(tokenSet.id_token.substring(0, headerEndIndex));
        const idTokenHeader: IJWTHeader = JSON.parse(idTokenHeaderStr);

        const payloadEndIndex = tokenSet.id_token.indexOf(".", headerEndIndex + 1);
        const idTokenPayloadStr = decodeJWTPart(tokenSet.id_token.substring(headerEndIndex + 1, payloadEndIndex));
        const idTokenPayload: IJWTPayload = JSON.parse(idTokenPayloadStr);

        // this one's still encrypted, but fortunately we don't need it.
        // const idTokenSignature = tokenSet.id_token.substring(payloadEndIndex + 1);

        // First, validate the id_token, including the nonce (unless it's a refresh_token grant)
        // https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation (3.1.3.7)
        // step 1 is not applicable at this time since we don't request encryption at registration.
        // step 2
        assertIDTokenMatch("Issuer", issuer, idTokenPayload.iss);
        // step 3
        if (Array.isArray(idTokenPayload.aud)) {
            throw new Error("ID token contained multiple audiences, but only one was expected");
        }
        assertIDTokenMatch("Audience", Authenticator.OIDC_CLIENT_ID, idTokenPayload.aud);
        // we only expect 1 audience (which is why we checked for an array) so steps 4, 5 don't apply
        // Step 6 MAY be skipped in the auth_code flow.
        // step 7
        assertIDTokenMatch("Algorithm", EXPECTED_JWT_ALG, idTokenHeader.alg);
        // step 8 not applicable since we're using the default (see step 7)
        // step 9 (note Date.now is in ms but exp and iat are in s)
        const now = Date.now();
        const expiryMs = idTokenPayload.exp * 1000;
        if (expiryMs <= now) {
            throw new Error(`Expiry ${expiryMs}ms is not in the future, current time is ${now}ms`);
        }
        // step 10 doesn't apply because we only do one authentication flow at a time.
        // step 11
        assertIDTokenMatch("Nonce", nonce, idTokenPayload.nonce);
        // steps 12, 13 don't apply because we didn't request those claims.

        // Validate the access_token
        // https://openid.net/specs/openid-connect-core-1_0.html#CodeFlowTokenValidation (3.1.3.8 which links to 3.2.2.9)
        const hashedAT: Buffer = crypto.createHash(JWT_ALG_CRYPTO_NAME).update(tokenSet.access_token).digest();

        const firstHalfb64 = hashedAT.slice(0, hashedAT.length / 2).toString("base64");
        // The at_hash appears to be made URL-safe as specified in https://en.wikipedia.org/wiki/Base64#Variants_summary_table row 4, RFC 4648
        // So here we normalize the encoded access_token so they can match.
        const firstHalfNormalized = firstHalfb64
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");

        assertIDTokenMatch("Access token hash", firstHalfNormalized, idTokenPayload.at_hash);
    }

    function decodeJWTPart(part: string): string {
        return Buffer.from(part, "base64").toString("ascii");
    }

    function assertIDTokenMatch(label: string, expectedValue: string, actualValue: string): void {
        if (expectedValue !== actualValue) {
            const errMsg = `${label} mismatch when validating ID token`;
            Log.e(errMsg, expectedValue, actualValue);
            throw new Error(errMsg);
        }
    }
}

export default TokenSetManager;
