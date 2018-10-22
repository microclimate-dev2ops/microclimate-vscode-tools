import { ExtensionContext } from "vscode";

import * as path from "path";
import * as fs from "fs";
import * as util from "util";
import * as os from "os";

export class Logger {

    private static readonly LOG_NAME: string = "microclimate-tools.log";

    private static logFilePath: string;

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
            console.log(args);
            return;
        }

        // const stack = new Error().stack;

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

        const label = `[${level}: ${this.getDateTime()}]:`;
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

    private static getDateTime(): string {
        const now = new Date();
        // formats to eg. 22/10/2018 9:40:15
        // Note add 1 to month because months are 0-indexed
        return `${leftPad(now.getDate())}/${leftPad(now.getMonth() + 1)}/${now.getFullYear()} ` +
            `${leftPad(now.getHours())}:${leftPad(now.getMinutes())}:${leftPad(now.getSeconds())}`;
    }
}

// converts a 1-char number to a 2-char with a leading 0. eg. leftPad("2") -> "02"
function leftPad(n: number): string {
    if (n >= 10) {
        return n.toString();
    }
    return "0" + n;
}

export namespace Logger {
    export enum Levels {
        INFO = "INFO",
        WARNING = "WARN",
        ERROR = "ERROR"
    }
}