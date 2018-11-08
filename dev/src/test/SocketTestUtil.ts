import * as io from "socket.io-client";

// I don't know how to import this properly
// tslint:disable-next-line:no-require-imports
import wildcard = require("socketio-wildcard");

import EventTypes from "../constants/EventTypes";
import ProjectState from "../microclimate/project/ProjectState";
import Log from "../Logger";

export interface ExpectedSocketEvent {
    readonly eventType: EventTypes;
    readonly projectID?: string;
    readonly expectedData?: { key: string, value: any };
    resolveFn?: (result: SocketEventData) => void;
}

interface SocketEvent {
    type: string;
    nsp?: string;
    data: SocketEventData;
}

interface SocketEventData {
    [key: string]: string;
    projectID: string;
}

// tslint:disable:ban

export function createTestSocket(uri: string): Promise<SocketIOClient.Socket> {
    Log.t("Creating test socket at: " + uri);
    const socket = io(uri);

    // use the socket-io-wildcard middleware so we can send all events to one function
    wildcard(io.Manager)(socket);
    socket.on("*", onSocketEvent);

    return new Promise<SocketIOClient.Socket>( (resolve) => {
        socket.on("connect", () => {
            Log.t("Socket connect success");
            return resolve(socket);
        });

        socket.connect();
    });
}

const expectedSocketEvents: ExpectedSocketEvent[] = [];
// let _expectedSocketEvent: ExpectedSocketEvent | undefined;

async function onSocketEvent(rawEvent: any): Promise<void> {
    const event: SocketEvent = {
        type: rawEvent.data[0],
        data: rawEvent.data[1]
    };
    // Logger.test("onSocketEvent ", event);

    if (expectedSocketEvents.length === 0) {
        return;
    }

    const matchedEvent = expectedSocketEvents.find( (e) => eventMatches(e, event));

    if (matchedEvent != null) {
        Log.t(`Expected socket event was received of type ${event.type} ` +
                `for project ${matchedEvent.projectID} with data ${JSON.stringify(matchedEvent.expectedData)}`);

        if (matchedEvent.resolveFn != null) {
            // This causes expectSocketEvent to resolve with this event's data
            matchedEvent.resolveFn(event.data);
        }
        else {
            console.error("ExpectedEvent did not have a resolve function", matchedEvent);
        }
        // _expectedSocketEvent = undefined;
        expectedSocketEvents.splice(expectedSocketEvents.indexOf(matchedEvent), 1);
        if (expectedSocketEvents.length > 0) {
            Log.t("Still waiting for socket events:", expectedSocketEvents);
        }
    }
}

function eventMatches(expectedEvent: ExpectedSocketEvent, event: SocketEvent): boolean {

    // First check that the event is of the correct type
    if (expectedEvent.eventType === event.type) {
        // check that the event is for the correct project
        if (expectedEvent.projectID != null && expectedEvent.projectID !== event.data.projectID) {
            return false;
        }

        // check that the event has the correct data, if specific data is expected
        if (expectedEvent.expectedData == null) {
            return true;
        }
        // Logger.test("Event type matches expected event:", expectedEvent, "actual event:", event);

        for (const key of Object.keys(event.data)) {
            // Check that the event contains the expected key that it maps to the expected value
            if (key === expectedEvent.expectedData.key &&
                    event.data[key] === expectedEvent.expectedData.value) {

               return true;
            }
        }
    }
    return false;
}

export async function expectSocketEvent(event: ExpectedSocketEvent): Promise<SocketEventData> {
    expectedSocketEvents.push(event);

    Log.t(`Now waiting for socket event of type ${event.eventType} and data: ${JSON.stringify(event.expectedData)}`);
    Log.t(`Events being waited for are now:`, expectedSocketEvents);

    return new Promise<SocketEventData>( (resolve) => {
        // This promise will be resolved with the socket event's 'data' in onSocketEvent above when a matching event is received
        event.resolveFn = resolve;
    });
}

export function getAppStateEvent(projectID: string, appState: ProjectState.AppStates): ExpectedSocketEvent {
    if (appState === ProjectState.AppStates.DEBUGGING) {
        throw new Error("There is no Debugging state event");
    }
    return {
        eventType: EventTypes.PROJECT_STATUS_CHANGED,
        projectID: projectID,
        expectedData: { key: "appStatus", value: appState.toString().toLowerCase() }
    };
}