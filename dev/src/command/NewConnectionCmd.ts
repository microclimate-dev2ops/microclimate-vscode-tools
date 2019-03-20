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
import { config as KubeConfig, Client1_10 as KubeClient } from "kubernetes-client";
// import * as k8s from "@kubernetes/client-node";

import MCUtil from "../MCUtil";
import Log from "../Logger";
import ConnectionFactory from "../microclimate/connection/ConnectionFactory";
import Connection from "../microclimate/connection/Connection";
import ICPInfoMap from "../microclimate/connection/ICPInfoMap";

const DEFAULT_HOST = "localhost";
const DEFAULT_LOCAL_PORT = 9090;
const DEFAULT_LOCAL_URI: vscode.Uri = vscode.Uri.parse(`http://${DEFAULT_HOST}:${DEFAULT_LOCAL_PORT}`);

/**
 * Create a new connection. Must display any errors; not throw.
 */
export async function newConnectionCmd(): Promise<Connection | undefined> {
    Log.d(`New connection command invoked`);

    let kubeData: IKubeData | undefined;
    try {
        kubeData = await getKubeData();
        if (kubeData == null) {
            return undefined;
        }
    }
    catch (err) {
        Log.e("new connection error", err);
        vscode.window.showErrorMessage(err.toString());
        return undefined;
    }

    await ICPInfoMap.updateICPInfoMap(kubeData.ingressUrl, kubeData.masterHost);
    return ConnectionFactory.tryAddConnection(kubeData.ingressUrl);
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

interface IKubeData {
    readonly masterHost: string;
    readonly ingressUrl: vscode.Uri;
    readonly namespace: string;
}

/**
 * https://github.com/godaddy/kubernetes-client#initializing
 */
async function getKubeData(): Promise<IKubeData | undefined> {

    // Load the user's kube configuration
    const config = KubeConfig.fromKubeconfig();


    const positiveResponse = "Yes";
    const response = await vscode.window.showInformationMessage(
        `The currently configured cluster is ${config.url}. Is this the cluster you wish to connect to?`,
        { modal: true }, positiveResponse
    );

    if (response == null) {
        // https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/
        vscode.window.showWarningMessage(`You must log into your cluster using cloudctl or kubectl before you can access it. ` +
            `The configuration used is determined by the KUBECONFIG environment variable, then the config file at $HOME/.kube/config. ` +
            `See the Kubernetes documentation for more details.`);
        return undefined;
    }
    // The user confirmed this is indeed the cluster they want to work against.

    const masterHost: string = MCUtil.getHostnameFromAuthority(vscode.Uri.parse(config.url).authority);
    Log.i("MasterHost", masterHost);
    if (!masterHost) {
        throw new Error(`Error getting hostname from URL ${config.url}  `);
    }

    const client = new KubeClient({
    //     // config: Object.assign(config, { timeout: 15000 })
        config
    });
    Log.d("Created kube client");

    let ingresses: KubeResponse;
    try {
        ingresses = await client.apis.extensions.v1beta1.ingresses.get();
    }
    catch (err) {
        Log.w("Initial kube connection error", err);
        if (err.statusCode === 401) {
            throw new Error("You are not authorized to log into this cluster. Make sure you are currently logged in and try again.");
        }
        throw err;
    }

    const rawIngress = ingresses.body.items.find((ingress) => ingress.metadata.name.includes("ibm-microclimate"));
    if (!rawIngress) {
        throw new Error("No Microclimate ingress was found");
    }

    const ingressHost = rawIngress.spec.rules[0].host;
    const namespace = rawIngress.metadata.namespace;
    Log.i(`Found ingress host ${ingressHost} in namespace ${namespace}`);
    const ingressUrl = vscode.Uri.parse("https://" + ingressHost);

    return {
        masterHost, ingressUrl, namespace,
    };
}
