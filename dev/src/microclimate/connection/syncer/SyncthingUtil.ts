import * as vscode from "vscode";
import * as path from "path";
import * as childProcess from "child_process";
import * as xmlParser from "fast-xml-parser";
import * as fs from "fs";
import * as request from "request-promise-native";

import MCUtil from "../../../MCUtil";
import Log from "../../../Logger";

export interface ISyncthingGuiData {
    readonly apikey: string;
    readonly guiUrl: vscode.Uri;
}

namespace SyncthingUtil {

    const SYNCTHING_DIR = "syncthing";
    const CONFIG_DIR = "configs";
    const BIN_DIR = "bin";

    const ENCODING = "utf8";
    // const HOST_BASE_CONFIG_FILE = "HostBaseConfig.xml";
    const CONFIG_FILE = "config.xml";

    const ATTR_PREFIX = "@_";
    const XML_PARSER_OPTIONS = { attributeNamePrefix: ATTR_PREFIX, ignoreAttributes: false };

    export const START_TIMEOUT = 30000;

    function getSyncthingDir(): string {
        return path.join(global.__extRoot, SYNCTHING_DIR);
    }

    function getBaseConfigDir(): string {
        return path.join(getSyncthingDir(), CONFIG_DIR);
    }

    export function getConnectionConfigDir(masterHost: string): vscode.Uri {
        const configDirname = MCUtil.slug(masterHost);
        const configPathStr = path.join(getBaseConfigDir(), configDirname);
        return vscode.Uri.file(configPathStr);
    }

    export function doesConfigExist(configDir: vscode.Uri): boolean {
        const configFile = path.join(configDir.fsPath, CONFIG_FILE);
        return fs.existsSync(configFile);
    }

    export function getExecutablePath(): vscode.Uri {
        const platf = MCUtil.getOS();
        // the folder names match the OSs, ie BIN_DIR/windows/syncthing.exe
        const executable = platf === "windows" ? "syncthing.exe" : "syncthing";
        const execPath = path.join(getSyncthingDir(), BIN_DIR, platf, executable);
        return vscode.Uri.file(execPath);
    }

    /**
     * Combine the HostBaseConfig (Microclimate config) and the generated config.xml to create a working config,
     * then write over the generate config with our new merged config.
     */
    export function writeMicroclimateConfig(configDir: vscode.Uri, workspaceDir: vscode.Uri): void {
        Log.d("Merging syncthing-generated config with Microclimate config");
        // first, read in the generated config
        const configFile = getCurrentConfigObject(configDir);
        const config = configFile.contents;

        try {
            // Overwrite the default config with our microclimate config
            config.configuration.folder[`${ATTR_PREFIX}label`] = path.basename(configDir.fsPath) + "-microclimate-remote-workspace";
            config.configuration.folder[`${ATTR_PREFIX}path`] = workspaceDir.fsPath;

            config.configuration.options.relaysEnabled = false;
            config.configuration.options.startBrowser = false;
            config.configuration.options.natEnabled = false;
            config.configuration.options.autoUpgradeIntervalH = 0;
        }
        catch (err) {
            if (err instanceof TypeError) {
                // likely something was undefined
                Log.e("Error merging syncthing configs", err);
                Log.e("Generated config:", config);
                throw new Error("Error parsing syncthing config");
            }
            throw err;
        }

        // write over the generated config with our new, merged config
        // https://www.npmjs.com/package/fast-xml-parser#json--js-object-to-xml
        let mergedConfigXml: string = (new xmlParser.j2xParser({ ...XML_PARSER_OPTIONS, format: true })).parse(config);
        // It inserts nested "undefined" tags sometimes when it shouldn't, maybe this can be fixed with an option but this is a workaround
        mergedConfigXml = mergedConfigXml.replace(/\<\/?undefined\>/g, "");
        fs.writeFileSync(configFile.path, mergedConfigXml, { encoding: ENCODING });
        Log.i("Finished merging syncthing config");
    }

    export function getGuiDataFromConfig(configDir: vscode.Uri): ISyncthingGuiData {
        return getGuiDataFromObject(getCurrentConfigObject(configDir).contents);
    }

    function getCurrentConfigObject(configDir: vscode.Uri): { path: string, contents: any } {
        const generatedConfigPath = path.join(configDir.fsPath, CONFIG_FILE);
        Log.d("Read in current config from " + generatedConfigPath);
        const generatedContents = fs.readFileSync(generatedConfigPath, { encoding: ENCODING });

        // read in generated config as JSON
        // https://www.npmjs.com/package/fast-xml-parser#xml-to-json
        const traversalObj = xmlParser.getTraversalObj(generatedContents, XML_PARSER_OPTIONS);
        return {
            path: generatedConfigPath,
            contents: xmlParser.convertToJson(traversalObj, XML_PARSER_OPTIONS)
        };
    }

    function getGuiDataFromObject(configContents: any): ISyncthingGuiData {
        return {
            apikey: configContents.configuration.gui.apikey,
            guiUrl: configContents.configuration.gui.address,
        };
    }

    /**
     *
     * @param executablePath Path to syncthing executable
     * @param args https://docs.syncthing.net/users/syncthing.html#options
     * @param timeoutMs Fail the command after timeout expires, or undefined to let it run indefinitely
     */
    export async function syncthingExec(executablePath: vscode.Uri, args: string[], timeoutMs?: number): Promise<void> {
        args = args.concat("-verbose");

        Log.d("Running syncthing command, args:", args);
        return new Promise<void>((resolve, reject) => {
            childProcess.execFile(executablePath.fsPath, args, { /*cwd: getSyncthingDir(),*/ timeout: timeoutMs }, (err, stdout, stderr) => {
                if (err) {
                    Log.e("Error running syncthing:", err);
                    if (stderr) {
                        Log.e("stderr:", stderr);
                    }
                    else {
                        Log.e("No error output");
                    }
                    if (stdout) {
                        Log.e("stdout:", stdout);
                    }
                    else {
                        Log.e("No standard output");
                    }
                    return reject(err);
                }
                Log.d("Syncthing command success, output:\n", stdout);
                resolve();
            });
        });
    }

    const PING_TIMEOUT_S = 30;

    /**
     * Ping syncthing until it comes up and stays up or until it times out
     * @param guiUrl
     * @param apikey
     */
    export async function pingSyncthing(guiUrl: string, apikey: string): Promise<void> {
        let successes = 0;
        const requiredSuccesses = 3;
        const interval = setInterval(async () => {
            try {
                await request.get(guiUrl, { headers: { "X-Api-Key": apikey }});
                // if the request succeeded then syncthing is up & running
                // it can still crash after this, though
                successes++;
                Log.d(`Successfully connected to syncthing ${successes} times`);
                if (successes >= requiredSuccesses) {
                    clearInterval(interval);
                    Log.i("Syncthing appears to have started successfully");
                    return;
                }
            }
            catch (err) {
                if (!MCUtil.includesMulti(MCUtil.errToString(err).toLowerCase(), "timedout", "refused")) {
                    Log.d("Syncthing ping threw unexpected error", err);
                }
            }
        }, 1500);

        setTimeout(() => {
            clearInterval(interval);
            throw new Error(`Syncthing did not start after ${PING_TIMEOUT_S}s`);
        }, PING_TIMEOUT_S * 1000);
    }

}

export default SyncthingUtil;
