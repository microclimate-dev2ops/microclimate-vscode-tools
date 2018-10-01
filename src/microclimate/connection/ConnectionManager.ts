import { Uri } from "vscode";
import Connection from "./Connection";
import MCSocket from "./MCSocket";
import { tryAddConnection } from "../../command/NewConnectionCmd";
import Project from "../project/Project";

export default class ConnectionManager {

    private static _instance: ConnectionManager;

    private readonly _connections: Connection[] = [];
    private readonly listeners: ( () => void ) [] = [];

    private constructor() {
        ConnectionManager._instance = this;

        // add default connection
        // TODO just for testing
        tryAddConnection("localhost", 9090);
    }

    public static get instance(): ConnectionManager {
        return ConnectionManager._instance || (ConnectionManager._instance = new this());
    }

    public get connections(): Connection[] {
        return this._connections;
    }

    public static buildUrl(host: string, port: number): Uri {
        return Uri.parse(`http://${host}:${port}`);
    }

    public async addConnection(uri: Uri, host:string, workspace: Uri): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.connectionExists(uri)) {
                return reject("Connection already exists at " + uri);
            }

            // all validation that this connection is good must be done by this point
            
            const connection: Connection = new Connection(uri, host, workspace);
            console.log("New Connection @ " + uri);
            this._connections.push(connection);
    
            this.onChange();
            return resolve();
        });
    }

    private connectionExists(uri: Uri): Boolean {
        return this._connections.some((conn) => {
            return conn.mcUri.toString() === uri.toString();
        });
    }

    /**
     * Pass this a function to call whenever a connection is added, removed, or changed, 
     * eg to trigger a tree update in the UI.
     */
    public addOnChangeListener(callback: () => void): void {
        console.log("Adding onChangeListener " + callback.name);
        this.listeners.push(callback);
    }

    /**
     * Call this whenever a connection is added, removed, or changed.
     */
    public onChange = (): void => {
        console.log("ConnectionManager OnChange");
        this.listeners.forEach( (f) => f());
    }

    /*
    // There's likely a better way to do this...
    public async getProjectByName(projectName: string): Promise<Project[]> {

        return new Promise<Project[]>( (resolve, _) => {

            const matchingProjects: Project[] = [];
            this.connections.forEach(async (conn) => {
                const projects = await conn.getProjects();

                const matchingProject = projects.find( (p) => p.name === projectName);
                if (matchingProject != null) {
                    matchingProjects.push(matchingProject);
                }
            });

            return resolve(matchingProjects);
        });
    }*/
}