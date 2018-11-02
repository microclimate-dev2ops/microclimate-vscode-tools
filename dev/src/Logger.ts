import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as util from "util";
import { ExtensionContext } from "vscode";

// tslint:disable ban

export class Logger {

    private static readonly LOG_NAME: string = "microclimate-tools.log";

    private static logFilePath: string;

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
                // TODO test this!
                console.error("Error creating log file!", err);
                this.logInner = util.promisify(console.log);
            }
        }

        const fullPath = path.join(context.logPath, this.LOG_NAME);
        this.logFilePath = fullPath;
        console.log("Microclimate Tools log file is at " + this.logFilePath);
        this.log("Logger initialized at " + this.logFilePath);
    }

    public static async log(s: string, ...args: any[]): Promise<void> {
        return this.logInner(Logger.Levels.INFO, s, args);
    }

    public static async logW(s: string, ...args: any[]): Promise<void> {
        return this.logInner(Logger.Levels.WARNING, s, args);
    }

    public static async logE(s: string, ...args: any[]): Promise<void> {
        return this.logInner(Logger.Levels.ERROR, s, args);
    }

    private static async logInner(level: Logger.Levels, s: string, args: any[]): Promise<void> {
        if (this.logFilePath == null) {
            console.error("Logger.log error - No log file path set!");
            console.log(s, args);
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
        catch(err) {
            console.error(err);
        }

        const label = `[${level}: ${getDateTime()}${caller}]:`;
        const msg: string = `${label} ${argsStr}${os.EOL}`;

        return new Promise<void>( (resolve, _) => {
            // Send the message to both the 'console' and the logfile.
            const consoleFn = level === this.Levels.ERROR ? console.error : console.log;
            if(args.length > 0) {
                consoleFn(label, s, ...args);
            }
            else {
                consoleFn(label, s);
            }

            fs.appendFile(this.logFilePath, msg, (err: NodeJS.ErrnoException) => {
                if (err) {
                    console.error("FS error when logging:", err);
                }
                return resolve();
            });
        });
    }
}

const callingFileRegex: RegExp  = /\w+\.js/g;
// const callingFnRegex: string    = `at\s(\w)+\s`;

function getCaller(): string {
    const stack = new Error().stack;
    if (stack != null) {
        const stackLines = stack.split("\n");
        //console.log("stackLines:", stackLines);

        // Work our way UP the stack until we hit a Logger function, then take the function call before that one.
        for (const [i, line] of stackLines.reverse().entries()) {
            if (line.includes(__filename)) {
                const callerRaw: string = stackLines[i-1].trim();
                // the callerRaw line will look like this:
                // "at activate (/Users/tim/programs/microclimate-vscode/dev/out/extension.js:13:21)"
                // we want to format it into "extension.js.activate()"

                // The second word is the function name (after "at")
                const splitResult: string[] = callerRaw.split(" ");
                let callerFn = "";
                if (splitResult.length > 1) {
                    let functionName = splitResult[1];
                    // If it's a callback, there will be extra stuff we aren't interested in separated by dots
                    // eg "Project.__dirname.constructor.connection.update"
                    // strip out everything up to the last dot, if there is one
                    const splitByPeriod: string[] = functionName.split(".");
                    if (splitByPeriod.length > 0) {
                        functionName = splitByPeriod[splitByPeriod.length - 1];
                    }

                    callerFn = `.${functionName}()`;
                }
                else {
                    console.log("Couldn't parse function name from:", callerRaw);
                    return "";
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

                return `${callerFile}${callerFn}`;
            }
        }
    }
    console.error("Couldn't find caller line");
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

export namespace Logger {
    export enum Levels {
        INFO = "INFO",
        WARNING = "WARN",
        ERROR = "ERRO"
    }
}

export default Logger;