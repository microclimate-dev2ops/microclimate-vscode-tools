import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as util from "util";
import { ExtensionContext } from "vscode";

// non-nls-file

// tslint:disable no-console

export class Log {

    private static readonly LOG_NAME: string = "microclimate-tools.log";

    private static logFilePath: string;

    private static disabledLevels: Log.Levels[] = [];

    public static get getLogFilePath(): string {
        return this.logFilePath;
    }

    public static setLogFilePath(context: ExtensionContext): void {
        // Directory provided by extension context may not exist
        const logDir = context.logPath;
        const mode = 0o744;

        try {
            fs.accessSync(logDir, mode);
        }
        catch (err) {
            // logDir doesn't exist, we must create it
            try {
                fs.mkdirSync(logDir, mode);
                console.log("Microclimate Tools created logs dir", logDir);
            }
            catch (err) {
                // This shouldn't happen, but fall back to console.log if it does.
                console.error("Error creating log file!", err);
                this.logInner = util.promisify(console.log);
            }
        }

        const fullPath = path.join(context.logPath, this.LOG_NAME);
        this.logFilePath = fullPath;
        console.log("Microclimate Tools log file is at " + this.logFilePath);
        this.i("Logger initialized at " + this.logFilePath);
    }

    public static silenceLevels(level: Log.Levels, ...levels: Log.Levels[]): void {
        levels = levels.concat(level);
        Log.i("Disabling log levels:", levels);
        this.disabledLevels = levels;
    }

    public static async d(s: string, ...args: any[]): Promise<void> {
        this.logInner(Log.Levels.DEBUG, s, args);
    }

    public static async i(s: string, ...args: any[]): Promise<void> {
        this.logInner(Log.Levels.INFO, s, args);
    }

    public static async w(s: string, ...args: any[]): Promise<void> {
        this.logInner(Log.Levels.WARNING, s, args);
    }

    public static async e(s: string, ...args: any[]): Promise<void> {
        this.logInner(Log.Levels.ERROR, s, args);
    }

    public static async t(s: string, ...args: any[]): Promise<void> {
        this.logInner(Log.Levels.TEST, s, args);
    }

    private static async logInner(level: Log.Levels, s: string, args: any[]): Promise<void> {
        if (this.logFilePath == null) {
            console.error("Logger.log error - No log file path set!");
            console.log(s, args);
            return;
        }
        else if (this.disabledLevels.includes(level)) {
            return;
        }

        const argsStr: string = args.reduce( (result: string, arg: any): string => {
            if (arg instanceof Object) {
                try {
                    arg = JSON.stringify(arg, undefined, 2);
                }
                catch (err) {
                    // Can fail eg on objects with circular references
                    // console.error("Error logging object:", arg);
                    arg = `*** Failed to log object`;
                }
            }

            result = result.concat(os.EOL, arg);
            return result;
        }, s);

        let caller = "";
        try {
            caller = " " + getCaller();
        }
        catch (err) {
            console.error(err);
        }

        const label = `[${level}: ${getDateTime()}${caller}]:`;
        const msg: string = `${label} ${argsStr}${os.EOL}`;

        return new Promise<void>( (resolve) => {
            // Send the message to both the 'console' and the logfile.
            const consoleFn = level === this.Levels.ERROR ? console.error : console.log;
            if (args.length > 0) {
                consoleFn(label, s, ...args);
            }
            else {
                consoleFn(label, s);
            }

            fs.appendFile(this.logFilePath, msg, (err: NodeJS.ErrnoException) => {
                if (err != null) {
                    console.error("FS error when logging:", err);
                }
                return resolve();
            });
        });
    }
}

const callingFileRegex: RegExp  = /(\w+\.)?\w+\.(js|ts)/g;
// const callingFnRegex: string    = `at\s(\w)+\s`;

function getCaller(): string {
    const stack = new Error().stack;
    if (stack != null) {
        const stackLines = stack.split("\n");
        // console.log("stackLines:", stackLines);

        // Work our way UP the stack until we hit a Logger function, then take the function call before that one.
        for (const [i, line] of stackLines.reverse().entries()) {
            if (line.includes(__filename)) {
                const callerRaw: string = stackLines[i - 1].trim();
                // the callerRaw line will look like this:
                // "at activate (/Users/tim/programs/microclimate-vscode/dev/out/extension.js:13:21)"
                // we want to format it into "extension.js.activate()"

                // console.log("callerRaw", callerRaw);

                // The second word is the function name (after "at")
                const splitResult: string[] = callerRaw.split(" ");
                let callerFn = "";
                // Sometimes the function name will not be available in the stacktrace.
                // In this case there will only be 2 words: "at /some/path".
                if (splitResult.length > 2) {
                    let functionName = splitResult[1];
                    // console.log("FunctionName: " + functionName);
                    // If it's a callback, there will be extra stuff we aren't interested in separated by dots
                    // eg "Project.__dirname.constructor.connection.update"
                    // strip out everything up to the last dot, if there is one
                    const splitByPeriod: string[] = functionName.split(".");
                    if (splitByPeriod.length > 1) {
                        functionName = splitByPeriod[splitByPeriod.length - 1];
                        // Ignore anonymous functions, because displaying that is not helpful.
                        if (functionName !== "<anonymous>") {
                            callerFn = `.${functionName}()`;
                        }
                    }
                    else if (functionName === "new") {
                        // This happens when it's a constructor (if the function is named "new", above if should execute instead)
                        callerFn = `.<init>()`;
                    }
                }

                // filepath will be like "(/Users/tim/programs/microclimate-vscode/dev/out/extension.js:13:21)"
                // extract "extension.js"
                const filepath = splitResult[splitResult.length - 1];

                let callerFile = "";
                const filenameMatches: RegExpMatchArray | null = filepath.match(callingFileRegex);
                if (filenameMatches != null && filenameMatches.length > 0) {
                    callerFile = filenameMatches[0];
                }
                // console.log(`callerFn "${callerFn}" callerFile "${callerFile}"`);

                let lineNo: string = "";
                const splitByColon = callerRaw.split(":");
                if (splitByColon.length > 1) {
                    // The last value is the column. The second-to-last value is the line number.
                    lineNo = ":" + splitByColon[splitByColon.length - 2];
                }

                return `${callerFile}${callerFn}${lineNo}`;
            }
        }
    }
    console.error("Couldn't find caller line, filename is: " + __filename);
    return "";
}

function getDateTime(): string {
    const now = new Date();
    // formats to eg. 22/10/2018 9:40:15.832
    // Note add 1 to month because months are 0-indexed
    // return `${leftPad(now.getDate())}/${leftPad(now.getMonth() + 1)}/${now.getFullYear()} ` +
    return `${leftPad(now.getHours(), 2)}:${leftPad(now.getMinutes(), 2)}:${leftPad(now.getSeconds(), 2)}.${leftPad(now.getMilliseconds(), 3)}`;
}

/**
 * Convert the given number to a string of at least the given length.
 * Eg:
 * leftPad(3, 2) -> "03"
 * leftPad(20, 2) -> "20"
 * leftpad(400, 2) -> "400"     (just converts to string)
 */
function leftPad(n: number, desiredLen: number): string {
    const nStr = n.toString();
    const diff = desiredLen - nStr.length;
    if (diff <= 0) {
        return nStr;
    }
    return "0".repeat(diff) + nStr;
}

export namespace Log {
    export enum Levels {
        DEBUG = "DBUG",
        INFO = "INFO",
        WARNING = "WARN",
        ERROR = "ERRO",
        TEST = "TEST"
    }
}

export default Log;
