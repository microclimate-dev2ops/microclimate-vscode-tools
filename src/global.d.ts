
// This allows extending the Global namespace so we can have our own global variables.
// The only reason to add stuff here is if we can set it once in extension.activate,
// and then never modify it again (only read).
// Strongly discourage using this
declare namespace NodeJS {
    export interface Global {

        // Hold the path to the plugin's root folder,
        // so files don't each have to write their own logic to locate it.
        __extRoot: string
    }
}