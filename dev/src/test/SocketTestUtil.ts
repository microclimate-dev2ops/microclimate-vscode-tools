import * as io from "socket.io-client";
import wildcard = require("socketio-wildcard");

import EventTypes from "../microclimate/connection/EventTypes";
import ProjectState from "../microclimate/project/ProjectState";

export interface ExpectedSocketEvent {
    readonly eventType: EventTypes;
    readonly expectedData?: { key: string, value: any };
    resolveFn?: () => void;
}

export interface SocketEvent {
    type: string,
    nsp?: string,
    data: any
}

export function createTestSocket(uri: string): Promise<SocketIOClient.Socket> {
    console.log("Creating test socket at: " + uri);
    const socket = io(uri);

    // use the socket-io-wildcard middleware so we can send all events to one function
    wildcard(io.Manager)(socket);
    socket.on("*", onSocketEvent);

    return new Promise<SocketIOClient.Socket>( (resolve) => {
        socket.on("connect", () => {
            console.log("Socket connect success");
            return resolve(socket);
        });

        socket.connect();
    });
}

// const expectedSocketEvents: ExpectedSocketEvent[] = [];
let _expectedSocketEvent: ExpectedSocketEvent | undefined;

export async function onSocketEvent(rawEvent: any): Promise<void> {
    const event: SocketEvent = {
        type: rawEvent.data[0],
        data: rawEvent.data[1]
    }
    console.log("SocketTestUtil onSocketEvent ", event);

    /*
    if (expectedSocketEvents.length > 0) {
        for (const [i, expectedEvent] of expectedSocketEvents.entries()) {
            if (eventMatches(expectedEvent, event)) {
                if (expectedEvent.resolveFn != null) {
                    expectedEvent.resolveFn();
                }
                else {
                    console.error("ExpectedEvent did not have a resolve function", expectedEvent);
                }
                expectedSocketEvents.splice(i, 1);
            }
        }
    }*/
    if (_expectedSocketEvent == null) {
        return;
    }

    if (eventMatches(_expectedSocketEvent, event)) {
        console.log("Expected socket event was received", _expectedSocketEvent);
        if (_expectedSocketEvent.resolveFn != null) {
            _expectedSocketEvent.resolveFn();
        }
        else {
            console.error("ExpectedEvent did not have a resolve function", _expectedSocketEvent);
        }
        _expectedSocketEvent = undefined;
    }
}

function eventMatches(expectedEvent: ExpectedSocketEvent, event: SocketEvent): Boolean {

    // First check that the event is of the correct type
    if (expectedEvent.eventType === event.type) {
        if (expectedEvent.expectedData == null) {
            return true;
        }
        // console.log("Event type matches expected:", expectedEvent, "\nevent:", event);

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

export async function expectSocketEvent(event: ExpectedSocketEvent): Promise<void> {
    // expectedSocketEvents.push(event);
    if (_expectedSocketEvent != null && _expectedSocketEvent.resolveFn != null) {
        console.log("Clearing old expected event", _expectedSocketEvent);
        _expectedSocketEvent.resolveFn();
    }

    _expectedSocketEvent = event;

    console.log(`Now waiting for socket event of type ${event.eventType} and data ${event.expectedData}`);
    return new Promise<void>( (resolve) => {
        // This promise will be resolved by onSocketEvent above, if the event matches
        event.resolveFn = resolve;
    });
}

export function getAppStateEvent(appState: ProjectState.AppStates): ExpectedSocketEvent {
    return {
        eventType: EventTypes.PROJECT_STATUS_CHANGED,
        expectedData: { key: "appStatus", value: appState.toString().toLowerCase() }
    };
}