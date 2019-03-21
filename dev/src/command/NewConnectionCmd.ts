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
// import { config as KubeConfig, Client1_10 as KubeClient } from "kubernetes-client";
import * as k8s from "@kubernetes/client-node";

import MCUtil from "../MCUtil";
import Log from "../Logger";
import ConnectionFactory from "../microclimate/connection/ConnectionFactory";
import { Connection } from "../microclimate/connection/ConnectionExporter";
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
        Log.e("New connection error", err);
        vscode.window.showErrorMessage(
            `Error connecting to cluster: ${MCUtil.errToString(err)}.
            Make sure you are currently logged in to this cluster, and check your cluster configuration.`
        );
        return undefined;
    }

    await ICPInfoMap.updateICPInfoMap(kubeData.ingressUrl, kubeData.masterHost);
    return ConnectionFactory.tryAddConnection(kubeData.ingressUrl, kubeData.namespace);
}

export async function newDefaultLocalConnectionCmd(): Promise<Connection | undefined> {
    return ConnectionFactory.tryAddConnection(DEFAULT_LOCAL_URI);
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
    const kubeConfig = new k8s.KubeConfig();
    kubeConfig.loadFromDefault();

    // It appears that if the kube config file doesn't exist, this will return localhost:8080
    const currentCluster = kubeConfig.getCurrentCluster();
    if (currentCluster == null) {
        throw new Error("Kubernetes is not configured, refer to the kubectl / cloudctl documentation");
    }

    const currentClusterUri = vscode.Uri.parse(currentCluster.server);

    const isLocalCluster = MCUtil.isLocalhost(currentClusterUri.authority);
    const positiveResponse = "Yes";
    const response = await vscode.window.showInformationMessage(
        `The currently configured cluster is "${currentCluster.name}" at ${currentCluster.server}.\n` +
        `${isLocalCluster ? "Note that this is a local cluster, which can happen if no configuration was found.\n" : ""}` +
        `Is this the cluster you wish to connect to?`,
        { modal: true }, positiveResponse
    );

    if (response == null) {
        // Kube doc:
        // https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/
        const badConfigMsg = `You must log into your cluster using cloudctl or kubectl before you can access it. ` +
        `The configuration used is determined by the KUBECONFIG environment variable, then the config file at $HOME/.kube/config. ` +
        `See the Kubernetes documentation for more details.`;
        vscode.window.showWarningMessage(badConfigMsg);
        return undefined;
    }
    // The user confirmed this is indeed the cluster they want to work against.

    const masterHost: string = MCUtil.getHostnameFromAuthority(currentClusterUri.authority);
    Log.i("MasterHost", masterHost);
    if (!masterHost) {
        throw new Error(`Error getting hostname from URL ${currentCluster.server}  `);
    }

    const kubeClient = kubeConfig.makeApiClient(k8s.Extensions_v1beta1Api);
    Log.d("Created kube client");

    let ingresses;
    try {
        ingresses = await kubeClient.listIngressForAllNamespaces();
    }
    catch (err) {
        Log.w("Initial kube connection error", err);
        if (err.statusCode === 401 || err.response && err.response.statusCode === 401) {
            throw new Error(`Received 401: You are not authorized to log into this cluster. Log in using cloudctl or kubectl and try again.`);
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
