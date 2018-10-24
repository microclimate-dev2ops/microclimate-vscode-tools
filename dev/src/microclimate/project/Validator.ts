import * as vscode from "vscode";
import * as path from "path";
import * as request from "request-promise-native";

import { Logger } from "../../Logger";
import Project from "./Project";
import Endpoints from "../../constants/Endpoints";
import Connection from "../connection/Connection";

export default class Validator {
    public static async validate(project: Project, validationPayload: any): Promise<void> {

        const validationResult: any[] = validationPayload.validationResults;
        Logger.log("validationresult", validationPayload);

        project.diagnostics.clear();
        for (const validationProblem of validationResult) {
            const sev = validationProblem.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;

            // This is annoying - it should be possible to omit the range.
            const nullRange: vscode.Range = new vscode.Range(0, 0, 0, 0);

            const diagnostic: vscode.Diagnostic = new vscode.Diagnostic(nullRange, validationProblem.details, sev);
            diagnostic.source = "Microclimate";

            // clicking on the error will take you to this URI
            let uri: string = project.localPath.fsPath;
            /*
            if (validationProblem.filename != null) {
                uri = path.join(uri, validationProblem.filename);
            }*/

            project.diagnostics.set(vscode.Uri.file(uri), [diagnostic]);

            //const action: string = validationProblem.type === "missing" ? "Create file" : "Take Action";    // improve the msg :)
            const generateBtn: string = "Generate";

            vscode.window.showErrorMessage(`Microclimate ${("" + validationProblem.label).toLowerCase()} ` + validationProblem.filepath, generateBtn)
                .then( (response: string | undefined) => {
                    // TODO Generate doesn't work for - pom.xml, package.json (node), Dockerfile-*
                    if (response === generateBtn) {
                        Connection.requestGenerate(project);
                    }
                });
        }
    }


}

