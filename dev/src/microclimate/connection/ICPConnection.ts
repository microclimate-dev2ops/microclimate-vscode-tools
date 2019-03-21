import * as vscode from "vscode";

import Log from "../../Logger";
import { Connection } from "./ConnectionExporter";
import { IConnectionData } from "./ConnectionData";
import ICPInfoMap from "./ICPInfoMap";
import Syncer from "./Syncer";
import Authenticator from "./auth/Authenticator";

// Do not import this directly! Use the ConnectionExporter
export default class ICPConnection extends Connection {

    public readonly masterHost: string;
    public readonly kubeNamespace: string;

    private readonly syncer: Syncer;

    constructor(
        connectionData: IConnectionData,
    ) {
        super(connectionData);

        const masterHost = ICPInfoMap.getMasterHost(this.mcUrl);
        if (masterHost == null) {
            throw new Error("No master host set for new connection: " + this.mcUrl);
        }
        this.masterHost = masterHost;

        const kubeNs = connectionData.kubeNamespace;
        if (kubeNs == null) {
            throw new Error("No kubernetes namespace set for new connection " + this.mcUrl);
        }
        this.kubeNamespace = kubeNs;

        this.syncer = new Syncer(this.workspacePath, this.masterHost);
        this.initialize();
    }

    /**
     * Returns a promise that resolves when this connection is 'ready'.
     * This is to be used by the ConnectionManager after construction.
     */
    public async initialize(): Promise<void> {
        await this.syncer.start();
        Log.d("ICP connection " + this + " has completed initialization");
    }

    public async destroy(isRefresh: boolean = false): Promise<void> {
        Log.d("Destroy ICP connection " + this);

        // Don't log out if it's a refresh
        const logoutPromise = !isRefresh ? this.logout() : Promise.resolve();

        return Promise.all([
            super.destroy(),
            logoutPromise,
        ]).then(() => Promise.resolve());
    }

    protected getContextID(): string {
        return super.getContextID() + ".icp";
    }

    public async logout(): Promise<void> {
        // Revoke is not implemented for the implicit flow. Until we switch back to auth_code flow, no revocation can be done.
        // For now, just delete the tokens from the extension's memory
        await Authenticator.clearTokensFor(this.mcUrl);
        await this.onDisconnect();
        const logoutMsg = `Logged out of ${this.mcUrl}\nUse "Refresh Connection" to log back in.`;
        vscode.window.showInformationMessage(logoutMsg);
        Log.d("Logged out of " + this);
    }

    // TODO move (some?) auth logic into this class
}
