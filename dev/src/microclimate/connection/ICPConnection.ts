import * as vscode from "vscode";

import Log from "../../Logger";
import { Connection } from "./ConnectionExporter";
import { IConnectionData } from "./ConnectionData";
import ICPInfoMap from "./ICPInfoMap";
import SyncthingWrapper from "./syncer/Syncthing";
import Authenticator from "./auth/Authenticator";

// Do not import this directly! Use the ConnectionExporter
export default class ICPConnection extends Connection {

    public readonly masterHost: string;
    public readonly kubeNamespace: string;

    private readonly syncer: SyncthingWrapper;

    /**
     * Resolves when this Connection is initialized. Can reject.
     */
    public readonly initPromise: Promise<void>;

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

        this.syncer = new SyncthingWrapper(this);
        this.initPromise = this.initialize();
    }

    private async initialize(): Promise<void> {
        return vscode.window.withProgress({
            title: `Initializing connection to ${this.mcUrl}...`,
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
        }, async (_progress, _token) => {
            await this.syncer.start();
            Log.i("ICP connection " + this + " has completed initialization");
        });
    }

    public async destroy(_isRefresh: boolean = false): Promise<void> {
        Log.d("Destroy ICP connection " + this);

        // Don't log out if it's a refresh
        // const logoutPromise = !isRefresh ? this.logout() : Promise.resolve();

        return Promise.all([
            super.destroy(),
            // logoutPromise,
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
