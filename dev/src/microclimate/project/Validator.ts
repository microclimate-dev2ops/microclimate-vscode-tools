import * as vscode from "vscode";

import Logger from "../../Logger";
import Project from "./Project";
import Requester from "./Requester";

namespace Validator {

    // from https://github.ibm.com/dev-ex/microclimate/blob/master/docker/file-watcher/server/src/projects/Validator.ts#L144
    interface ValidationResult {
        // severity: Severity;
        severity: string;
        filename: string;
        filepath?: string;
        // type: ProblemType
        label: string;
        details: string;
        quickfix?: {
            fixID: string,
            name: string,
            description: string
        };
    }

    export async function validate(project: Project, validationPayload: any): Promise<void> {

        const validationResults: ValidationResult[] = validationPayload.validationResults;
        Logger.log("validationresult", validationPayload);

        // clicking on the error will take you to this URI
        // it's the project folder path -
        // unfortunately vscode gives an error that it can't be opened when clicked, so this can likely be improved
        const diagnosticUri: vscode.Uri = project.localPath;

        const oldDiagnostics: vscode.Diagnostic[] = Project.diagnostics.get(diagnosticUri) || [];
        const newDiagnostics: vscode.Diagnostic[] = [];

        // For each validation problem, see if we already have an error for it. If so, do nothing.
        // If we don't, create an error and display a pop-up notifying the user of the new error.
        for (const validationProblem of validationResults) {
            const diagnosticMsg: string = validationProblem.details;

            const existingDiagnostic: vscode.Diagnostic | undefined = oldDiagnostics.find( (d) => d.message === diagnosticMsg);
            if (existingDiagnostic != null) {
                // we already have a marker for this error, we can re-use it and continue to the next one
                // and don't need to display the error pop-up again
                newDiagnostics.push(existingDiagnostic);
                continue;
            }

            const sev = validationProblem.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;

            const diagnostic: vscode.Diagnostic = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), diagnosticMsg, sev);
            diagnostic.source = `Microclimate`;
            newDiagnostics.push(diagnostic);

            // The interface declares filePath as optional, but it should always be set.
            const filePath = validationProblem.filepath || validationProblem.filename;
            const popupErrMsg = `Microclimate: ${validationProblem.label} ${filePath}`;

            // Allow the user to generate missing files.
            // Generate only works for dockerfile for some reason, so only display the Generate button if that's what's missing.
            if (validationProblem.filename === "Dockerfile") {
                const generateBtn: string = "Generate";

                vscode.window.showErrorMessage(popupErrMsg, generateBtn)
                    .then( (response: string | undefined) => {
                        if (response === generateBtn) {
                            Requester.requestGenerate(project);
                        }
                    });
            }
            else {
                // show the validation error without the Generate button.
                vscode.window.showErrorMessage(popupErrMsg);
            }
        }

        Project.diagnostics.set(diagnosticUri, newDiagnostics);
    }
}

export default Validator;