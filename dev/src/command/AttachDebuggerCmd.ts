import * as vscode from "vscode";

import * as MCUtil from "../MCUtil";
import { promptForProject } from "../command/CommandUtil";
import * as Resources from "../constants/Resources";
import Project from "../microclimate/project/Project";
import ProjectState from "../microclimate/project/ProjectState";
import Log from "../Logger";
import ProjectType from "../microclimate/project/ProjectType";
import DebugUtils from "../microclimate/project/DebugUtils";
import Translator from "../constants/strings/translator";
import StringNamespaces from "../constants/strings/StringNamespaces";

const STRING_NS = StringNamespaces.DEBUG;

/**
 * Attach the debugger to the given project. Returns if we attached the debugger successfully.
 */
export default async function attachDebuggerCmd(project: Project): Promise<boolean> {
    Log.d("attachDebuggerCmd");
    if (project == null) {
        const selected = await promptForProject(...ProjectState.getDebuggableStates());
        if (selected == null) {
            // user cancelled
            Log.d("User cancelled project prompt");
            return false;
        }
        project = selected;
    }

    // Wait for the server to be Starting - Debug or Debugging before we try to connect the debugger,
    // or it may try to connect before the server is ready
    Log.d(`Waiting for ${project.name} to be ready to for debugging`);
    try {
        // often this will resolve instantly
        await project.waitForState(60 * 1000, ...ProjectState.getDebuggableStates());
    }
    catch (err) {
        // can happen if EG the user requests another restart before this one finishes
        Log.w("Waiting for debuggable state was rejected:", err);
        return false;
    }

    try {
        // Intermittently for Microprofile projects, the debugger will try to connect too soon,
        // so add an extra delay if it's MP and Starting.
        // This doesn't really slow anything down because the server is still starting anyway.
        const libertyDelayMs = 2500;
        if (project.type.type === ProjectType.Types.MICROPROFILE && project.state.appState === ProjectState.AppStates.DEBUG_STARTING) {
            Log.d(`Waiting extra ${libertyDelayMs}ms for Starting Liberty project`);
            await new Promise( (resolve) => setTimeout(resolve, libertyDelayMs));
        }

        // This should be longer than the timeout we pass to VSCode through the debug config, or the default (whichever is longer).
        const debugConnectTimeoutS = 60;

        Log.d(`${project.name} appears to be ready for debugging`);
        const startDebugWithTimeout = MCUtil.promiseWithTimeout(DebugUtils.startDebugSession(project),
            debugConnectTimeoutS * 1000,
            Translator.t(STRING_NS, "didNotConnectInTime", { timeoutS: debugConnectTimeoutS })
        );

        const connectingMsg = Translator.t(STRING_NS, "connectingToProject", { projectName: project.name });
        vscode.window.setStatusBarMessage(`${Resources.getOcticon(Resources.Octicons.bug, true)} ${connectingMsg}`,     // non-nls
                startDebugWithTimeout);

        // will throw error if connection fails or timeout
        const successMsg = await startDebugWithTimeout;

        Log.i("Debugger attach success:", successMsg);
        vscode.window.showInformationMessage(successMsg);
        return true;
    }
    catch (err) {
        const debugUrl = project.debugUrl;
        // Show our error message here. we can't throw/reject or vscode won't know how to handle it
        let failMsg;
        if (debugUrl != null) {
            failMsg = Translator.t(STRING_NS, "failedToAttachWithUrl", { projectName: project.name, debugUrl });
        }
        else {
            failMsg = Translator.t(STRING_NS, "failedToAttach", { projectName: project.name });
        }

        const extraErrMsg: string = err.message ? err.message : "";         // non-nls
        Log.e(failMsg, extraErrMsg);

        if (extraErrMsg != null && extraErrMsg.length > 0) {
            failMsg += Translator.t(STRING_NS, "errDetailSeparator") + extraErrMsg;
        }
        vscode.window.showErrorMessage(failMsg);
        return false;
    }
}
