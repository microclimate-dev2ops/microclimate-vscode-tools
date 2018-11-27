import * as vscode from "vscode";

import Log from "../../Logger";
import Project from "./Project";
import Requester from "./Requester";
import Translator from "../../constants/strings/translator";
import StringNamespaces from "../../constants/strings/StringNamespaces";
import ProjectType from "./ProjectType";
import Commands from "../../constants/Commands";

namespace Validator {

    // from https://github.ibm.com/dev-ex/microclimate/blob/master/docker/file-watcher/server/src/projects/Validator.ts#L144
    interface IValidationResult {
        // severity: Severity;
        severity: string;
        filename: string;
        filepath: string;
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

        Log.d(`Validating project ${project.name}, payload is:`, validationPayload);

        const validationResults: IValidationResult[] = validationPayload.validationResults;
        if (validationResults == null) {
            Log.w("No validationResult in payload", validationPayload);
        }
        // Logger.log("validationresult", validationPayload);

        // clicking on the error will take you to this URI
        // it's the project folder path -
        // unfortunately vscode gives an error that it can't be opened when clicked, so this can likely be improved
        const diagnosticUri: vscode.Uri = project.localPath;

        const oldDiagnostics: vscode.Diagnostic[] = Project.diagnostics.get(diagnosticUri) || [];
        const newDiagnostics: vscode.Diagnostic[] = [];

        // For each validation problem, see if we already have an error for it. If so, do nothing.
        // If we don't, create an error and display a pop-up notifying the user of the new error.
        for (const validationProblem of validationResults) {
            Log.i("ValidationProblem:", validationProblem);
            const diagnosticMsg: string = validationProblem.details;

            const existingDiagnostic: vscode.Diagnostic | undefined = oldDiagnostics.find( (d) => d.message === diagnosticMsg);
            if (existingDiagnostic != null) {
                // we already have a marker for this error, we can re-use it and continue to the next one
                // and don't need to display the error pop-up again
                newDiagnostics.push(existingDiagnostic);
                continue;
            }

            const sev = validationProblem.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;       // non-nls

            const diagnostic: vscode.Diagnostic = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), diagnosticMsg, sev);
            diagnostic.source = Translator.t(StringNamespaces.DEFAULT, "microclimateName");
            newDiagnostics.push(diagnostic);

            const seeProblemsViewMsg = Translator.t(StringNamespaces.CMD_MISC, "seeProblemsView");
            const filePath = validationProblem.filepath;
            const popupErrMsg = `${diagnostic.source}: ${validationProblem.label} ${filePath}. ${seeProblemsViewMsg}`;     // non-nls

            const problemsBtn = Translator.t(StringNamespaces.DEFAULT, "focusOnProblems");
            // Allow the user to generate missing files.
            // Generate only works for dockerfile, so only display the Generate button if that's what's missing.
            // Full list of supported files: https://www.npmjs.com/package/generator-ibm-cloud-enablement#artifacts
            if (validationProblem.filename === "Dockerfile" && project.type.internalType !== ProjectType.InternalTypes.DOCKER) {      // non-nls
                const generateBtn: string = Translator.t(StringNamespaces.CMD_MISC, "generateFilesBtn");

                vscode.window.showErrorMessage(popupErrMsg, generateBtn, problemsBtn)
                    .then( (response: string | undefined) => {
                        if (response === generateBtn) {
                            Requester.requestGenerate(project);
                        }
                        // If the user clicks this, they miss their chance to Generate, which might be frustrating.
                        // Might not want to show this if we can Generate.
                        else if (response === problemsBtn) {
                            vscode.commands.executeCommand(Commands.VSC_FOCUS_PROBLEMS);
                        }
                    });
            }
            else {
                // show the validation error without the Generate button.

                vscode.window.showErrorMessage(popupErrMsg, problemsBtn)
                    .then( (response: string | undefined) => {
                        if (response === problemsBtn) {
                            vscode.commands.executeCommand(Commands.VSC_FOCUS_PROBLEMS);
                        }
                    });
            }
        }

        Project.diagnostics.set(diagnosticUri, newDiagnostics);
    }
}

export default Validator;
