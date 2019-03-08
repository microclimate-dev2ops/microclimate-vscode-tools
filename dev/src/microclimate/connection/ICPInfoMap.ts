import * as vscode from "vscode";

import Log from "../../Logger";

/**
 * Store & load the mappings of ingress URLs to master node IPs.
 */
namespace ICPInfoMap {
    export async function updateICPInfoMap(ingressUrl_: vscode.Uri, masterIP: string): Promise<void> {
        const ingressUrl: string = normalize(ingressUrl_);
        const extensionContext = global.extGlobalState as vscode.Memento;

        const oldValue = extensionContext.get<string>(ingressUrl);
        await extensionContext.update(ingressUrl, masterIP);
        if (oldValue !== masterIP) {
            Log.d(`The master node for ${ingressUrl} is now ${masterIP}`);
        }
    }

    export function getMasterIP(ingressUrl_: vscode.Uri): string | undefined {
        const ingressUrl: string = normalize(ingressUrl_);
        const extensionContext = global.extGlobalState as vscode.Memento;
        return extensionContext.get<string>(ingressUrl);
    }

    function normalize(url: vscode.Uri): string {
        return url.with({ path: "" }).toString();
    }
}

export default ICPInfoMap;
