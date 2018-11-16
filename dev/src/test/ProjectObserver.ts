import ConnectionManager from "../microclimate/connection/ConnectionManager";
import Log from "../Logger";
import ProjectState from "../microclimate/project/ProjectState";
import Connection from "../microclimate/connection/Connection";
import Project from "../microclimate/project/Project";

interface ProjectCreationAwaiting {
    projectName: string;
    resolveFunc: ( (projectID: string) => void );
}

interface ProjectStateAwaiting {
    projectID: string;
    states: ProjectState.AppStates[];
    resolveFunc: ( () => void );
}

export default class ProjectObserver {

    private readonly projectsPendingState: ProjectStateAwaiting[] = [];
    private readonly projectsPendingCreation: ProjectCreationAwaiting[] = [];

    private static _instance: ProjectObserver;

    public static get instance(): ProjectObserver {
        if (this._instance == null) {
            Log.e("You must first initialize the ProjectObserver by calling new ProjectObserver(connection)");
        }
        return this._instance;
    }

    constructor(
        public readonly connection: Connection
    ) {
        ProjectObserver._instance = this;
        ConnectionManager.instance.addOnChangeListener(this.onChange);
    }

    public onChange = () => {

        // Check if any of the projects pending creation have been created.
        this.projectsPendingCreation.forEach( async (pendingCreation, index) => {
            this.connection.getProjects()
                .then( (projects) => {
                    const findResult = projects.find( (p) => p.name === pendingCreation.projectName);
                    if (findResult != null) {
                        Log.t(`Project ${pendingCreation.projectName} was created`);
                        pendingCreation.resolveFunc(findResult.id);
                        this.projectsPendingCreation.splice(index, 1);
                    }
            });
        });

        // Check if any of the projects awaiting a state have reached that state.
        this.projectsPendingState.forEach( async (pendingProject: ProjectStateAwaiting, index: number) => {
            this.connection.getProjectByID(pendingProject.projectID)
                .then( (project) => {
                    if (project == null) {
                        Log.e("Couldn't get project with ID " + pendingProject.projectID);
                    }
                    else if (pendingProject.states.includes(project.state.appState)) {
                        Log.t(`Project ${project.name} reached pending state ${project.state}`);
                        pendingProject.resolveFunc();
                        this.projectsPendingState.splice(index, 1);
                    }
                });
        });
    }

    public async awaitProjectStarted(projectID: string): Promise<void> {
        return this.awaitProjectState(projectID, ...ProjectState.getStartedStates());
    }

    /**
     * This is really similar to Project.waitForState,
     * but we don't want to have to call that from tests because it will interfere with normal execution.
     */
    public async awaitProjectState(projectID: string, ...states: ProjectState.AppStates[]): Promise<void> {
        if (states.length === 0) {
            const msg = "ProjectObserver: Must provide at least one state to wait for";
            Log.e(msg);
            throw new Error(msg);
        }

        // we have to get a new Project object each time so that the state is refreshed
        const project = await this.connection.getProjectByID(projectID);
        if (project == null) {
            throw new Error("Could not find project with ID " + projectID);
        }
        if (states.includes(project.state.appState)) {
            Log.t(`No need to wait, ${project.name} is already ${project.state}`);
            return;
        }

        Log.t(`Wait for ${project.name} to be ${JSON.stringify(states)}, is currently ${project.state.appState}`);

        return new Promise<void> ( (resolve) => {
            this.projectsPendingState.push({
                projectID: project.id,
                states: states,
                resolveFunc: resolve
            });

            // Log.t(`projectsPendingState are now: ${JSON.stringify(this.projectsPendingState)}`);
        });
    }

    public async awaitCreate(name: string): Promise<string> {
        Log.t(`projectsPendingCreation are now: ${JSON.stringify(this.projectsPendingCreation)}`);

        return new Promise<string> ( (resolve) => {
            this.projectsPendingCreation.push({
                projectName: name,
                resolveFunc: resolve
            });
        });
    }
}
