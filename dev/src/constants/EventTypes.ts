
/**
 * List of Socket.io event types from Portal that we're interested in.
 */
enum EventTypes {
    PROJECT_CHANGED = "projectChanged",
    PROJECT_STATUS_CHANGED = "projectStatusChanged",
    PROJECT_CLOSED = "projectClosed",
    PROJECT_DELETION = "projectDeletion",
    PROJECT_RESTART_RESULT = "projectRestartResult",
    CONTAINER_LOGS = "container-logs",
    PROJECT_VALIDATED = "projectValidated",
    PROJECT_CREATION = "projectCreation"
}

export default EventTypes;
