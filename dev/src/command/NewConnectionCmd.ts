/*******************************************************************************
 * Copyright (c) 2018, 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

import * as vscode from "vscode";

import * as MCUtil from "../MCUtil";
import Log from "../Logger";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";
import ConnectionFactory from "../microclimate/connection/ConnectionFactory";
import Connection from "../microclimate/connection/Connection";

const DEFAULT_HOST = "localhost";
const DEFAULT_LOCAL_PORT = 9090;
const DEFAULT_LOCAL_URI: vscode.Uri = vscode.Uri.parse(`http://${DEFAULT_HOST}:${DEFAULT_LOCAL_PORT}`);

const STRING_NS = StringNamespaces.CMD_NEW_CONNECTION;

/**
 *
 * @param prefillUri URI to prefill when prompting the user to enter their Microclimate URI.
 */
export async function newConnectionCmd(prefillUri?: vscode.Uri): Promise<Connection | undefined> {
    Log.d(`New connection command invoked${prefillUri ? " prefillUri=" + prefillUri : ""}`);

    // get the URI to connect to
    const uri: vscode.Uri | undefined = await promptForConnectInfo(prefillUri);
    if (uri == null) {
        Log.d("New connection cmd cancelled");
        return undefined;
    }

    return ConnectionFactory.tryAddConnection(uri);
}

/**
 * Same as above, but connect to the given URI instead of prompting the user.
 */
export async function newConnectionCmdNoPrompt(uri: vscode.Uri): Promise<Connection | undefined> {
    return ConnectionFactory.tryAddConnection(uri);
}

export async function newDefaultLocalConnectionCmd(): Promise<Connection | undefined> {
    return newConnectionCmdNoPrompt(DEFAULT_LOCAL_URI);
}

async function promptForConnectInfo(prefillUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
    Log.d("promptForConnectInfo");

    const inputOpts: vscode.InputBoxOptions = {
        prompt: Translator.t(STRING_NS, "enterMicroclimateHost"),
        value: prefillUri != null ? prefillUri.toString() : undefined,
        ignoreFocusOut: true
    };

    const hostInput = await vscode.window.showInputBox(inputOpts);
    if (hostInput == null) {
        // user cancelled / didn't input anything valid
        return undefined;
    }

    // Uri.parse will return an empty URI if parsing fails
    const hostInputUri = vscode.Uri.parse(hostInput.trim());
    Log.d("hostInputUri=" + hostInputUri);

    let authority: string;
    let scheme: string = "";
    // if URI parsing succeeded
    if (hostInputUri.authority.length > 0) {
        authority = hostInputUri.authority;
        // scheme might still be empty after this
        scheme = hostInputUri.scheme;
        // any other URI components are discarded
    }
    else {
        Log.d("URI parsing failed");
        // URI parsing failed, assume they input just the hostname
        authority = hostInput;
    }

    if (!scheme) {
        scheme = MCUtil.isLocalhost(authority) ? "http" : "https";
    }

    Log.d(`scheme=${scheme} authority=${authority}`);
    const processedUrl = MCUtil.assembleUrl(scheme, authority);
    Log.d("The URL to connect to is " + processedUrl);
    return processedUrl;
}
