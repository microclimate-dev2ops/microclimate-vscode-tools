import * as io from "socket.io-client";
// tslint:disable-next-line:no-require-imports
import wildcard = require("socketio-wildcard");

import EventTypes from "../microclimate/connection/EventTypes";
import ProjectState from "../microclimate/project/ProjectState";
import Logger from "../Logger";

export interface ExpectedSocketEvent {
    readonly eventType: EventTypes;
    readonly expectedData?: { key: string, value: any };
    resolveFn?: () => void;
}

export interface SocketEvent {
    type: string;
    nsp?: string;
    data: any;
}


// tslint:disable:ban

export function createTestSocket(uri: string): Promise<SocketIOClient.Socket> {
    Logger.test("Creating test socket at: " + uri);
    const socket = io(uri);

    // use the socket-io-wildcard middleware so we can send all events to one function
    wildcard(io.Manager)(socket);
    socket.on("*", onSocketEvent);

    return new Promise<SocketIOClient.Socket>( (resolve) => {
        socket.on("connect", () => {
            Logger.test("Socket connect success");
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
    };
    // Logger.test("SocketTestUtil onSocketEvent ", event);

    if (_expectedSocketEvent == null) {
        return;
    }

    if (eventMatches(_expectedSocketEvent, event)) {
        Logger.test(`Expected socket event was received of type ${event.type} with data ${event.data}`);
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
        // Logger.test("Event type matches expected:", expectedEvent, "\nevent:", event);

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
        Logger.test("Clearing old expected event", _expectedSocketEvent);
        _expectedSocketEvent.resolveFn();
    }

    _expectedSocketEvent = event;

    Logger.test(`Now waiting for socket event of type ${event.eventType} and data: ${JSON.stringify(event.expectedData)}`);
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