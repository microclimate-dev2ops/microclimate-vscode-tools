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
import * as request from "request-promise-native";

import * as MCUtil from "../MCUtil";
import Log from "../Logger";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";
import ConnectionFactory from "../microclimate/connection/ConnectionFactory";
import Connection from "../microclimate/connection/Connection";
import Requester from "../microclimate/project/Requester";
import Commands from "../constants/Commands";
import ICPInfoMap from "../microclimate/connection/ICPInfoMap";
import { StatusCodeError } from "request-promise-native/errors";
import Endpoints from "../constants/Endpoints";
import AuthUtils from "../microclimate/connection/auth/AuthUtils";

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
    const ingressUrl: vscode.Uri | undefined = await promptForIngress(prefillUri);
    if (ingressUrl == null) {
        Log.d("ingress get cancelled");
        return undefined;
    }
    else if (MCUtil.isLocalhost(ingressUrl.authority)) {
        vscode.window.showInformationMessage("Use the \"New Local Connection\" command to connect to local Microclimate.");
        return undefined;
    }

    // prefill the master IP if we've connected to this ingress in the past
    const existingMasterIP = ICPInfoMap.getMasterIP(ingressUrl);
    const masterIP: string | undefined = await promptForMasterIP(existingMasterIP);
    if (masterIP == null) {
        Log.d("master ip get cancelled");
        return undefined;
    }
    await ICPInfoMap.updateICPInfoMap(ingressUrl, masterIP);

    return ConnectionFactory.tryAddConnection(ingressUrl);
}

/**
 * Same as above, but connect to the given URI instead of prompting the user.
 */
export async function newConnectionCmdNoPrompt(url: vscode.Uri): Promise<Connection | undefined> {
    return ConnectionFactory.tryAddConnection(url);
}

export async function newDefaultLocalConnectionCmd(): Promise<Connection | undefined> {
    return newConnectionCmdNoPrompt(DEFAULT_LOCAL_URI);
}

async function promptForIngress(prefillUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
    const inputOpts: vscode.InputBoxOptions = {
        prompt: Translator.t(STRING_NS, "enterMicroclimateIngress"),
        value: prefillUri != null ? prefillUri.toString() : undefined,
        ignoreFocusOut: true
    };

    const ingressInput = await vscode.window.showInputBox(inputOpts);
    if (ingressInput == null) {
        // user cancelled / didn't input anything valid
        return undefined;
    }

    // Uri.parse will return an empty URI if parsing fails
    const hostInputUri = vscode.Uri.parse(ingressInput.trim());
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
        authority = ingressInput;
    }

    if (!scheme) {
        scheme = "https";
    }

    Log.d(`scheme=${scheme} authority=${authority}`);
    const processedUrl = MCUtil.assembleUrl(scheme, authority);
    Log.d("The URL to connect to is " + processedUrl);
    return processedUrl;
}

const editBtn = Translator.t(STRING_NS, "editConnectionBtn");
const retryBtn = Translator.t(STRING_NS, "retryConnectionBtn");
const openUrlBtn = Translator.t(STRING_NS, "openUrlBtn");

async function promptForMasterIP(prefillIP?: string): Promise<string | undefined> {
    const inputOpts: vscode.InputBoxOptions = {
        prompt: Translator.t(STRING_NS, "enterMasterIP"),
        value: prefillIP,
        ignoreFocusOut: true
    };

    const masterIPInput = await vscode.window.showInputBox(inputOpts);
    if (masterIPInput == null) {
        // user cancelled / didn't input anything valid
        return undefined;
    }

    const masterIP = masterIPInput.trim();

    const testResult = await testMasterIP(masterIP);
    if (testResult === "edit") {
        return promptForMasterIP(masterIP);
    }
    else if (testResult === "success") {
        return masterIP;
    }
    return undefined;
}

/**
 * GET to the given IP on the Liberty HTTPS port.
 * This is how we test that it's (probably) the right IP address for an ICP master node.
 */
async function testMasterIP(masterIP: string): Promise<"success" | "fail" | "edit"> {
    const masterConsoleURL = `https://${masterIP}:${Endpoints.ICP_MASTER_SERVER_PORT}/`;
    Log.d("TestMasterIP " + masterConsoleURL);

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Connecting to ${masterConsoleURL} ...`,
            cancellable: true,
        }, (_progress, token) => {
            return new Promise<void>(async (resolve, reject) => {
                token.onCancellationRequested(() => {
                    return reject("Cancelled");
                });

                return request.get(masterConsoleURL, {
                    rejectUnauthorized: Requester.shouldRejectUnauthed(masterConsoleURL),
                    timeout: AuthUtils.TIMEOUT,
                })
                .then((result) => resolve(result))
                .catch((err) => reject(err));
            });
        });
        Log.d("Succeeded connecting to " + masterConsoleURL);
        return "success";
    }
    catch (err) {
        if (err instanceof StatusCodeError) {
            // Since we were able to connect to the right port, it's (probably) a master node.
            return "success";
        }
        // Other errors mean connection failure.
        const errMsg = err.message || err.toString();

        const response = await vscode.window.showErrorMessage(`Failed to connect to ${masterConsoleURL}. ${errMsg}. ` +
            `Please make sure this is the correct IP address for the Master node.`, retryBtn, editBtn, openUrlBtn);

        if (response === retryBtn) {
            return testMasterIP(masterIP);
        }
        else if (response === editBtn) {
            return "edit";
        }
        else if (response === openUrlBtn) {
            vscode.commands.executeCommand(Commands.VSC_OPEN, vscode.Uri.parse(masterConsoleURL));
            return "edit";
        }
    }
    return "fail";
}
