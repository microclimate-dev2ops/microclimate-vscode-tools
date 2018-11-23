
// All of these must obviously match the namespace object keys in strings.json
// Refer to these so that if the namespace names change we only have to update them here instead of everywhere we use that string.
enum StringNamespaces {
    DEFAULT = "",

    CMD_NEW_CONNECTION = "newConnectionCmd",
    CMD_OPEN_IN_BROWSER = "openInBrowserCmd",
    CMD_OPEN_LOG = "openLogCmd",
    CMD_MISC = "command",
    CMD_RES_PROMPT = "cmdResourcePrompt",

    DEBUG = "debug",
    LOGS = "logs",
    PROJECT = "project",
    REQUESTS = "requests",
    TREEVIEW = "treeView",
}

export default StringNamespaces;
