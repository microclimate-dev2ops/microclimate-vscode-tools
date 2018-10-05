import * as vscode from "vscode";

export default class JavaDebugConfigProvider implements vscode.DebugConfigurationProvider {

    /*
    provideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined, token?: vscode.CancellationToken):
            vscode.ProviderResult<vscode.DebugConfiguration[]> {

        return [];
    }*/

    resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, debugConfiguration: vscode.DebugConfiguration,
                token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {

        if (folder == null) {
            console.log("JavaDebugConfigProvider received null folder");
            return;
        }

        console.log("resolveDebugConfigs - folder is", folder, "debugConfig is ", debugConfiguration);
        return debugConfiguration;
    }
}