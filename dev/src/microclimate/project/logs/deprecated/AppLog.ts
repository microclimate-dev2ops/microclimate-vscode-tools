/*******************************************************************************
 * Copyright (c) 2018 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/

// import * as vscode from "vscode";

import MCLogOld from "./MCLog-Old";
import Log from "../../../../Logger";
import Translator from "../../../../constants/strings/translator";

export default class AppLog extends MCLogOld {

    private initialized: boolean = false;
    private previousLength: number = 0;

    constructor(
        public readonly projectID: string,
        public readonly projectName: string,
        managerMap: Map<string, MCLogOld>
    ) {
        super(projectID, projectName, MCLogOld.LogTypes.APP,
            managerMap,
            Translator.t(MCLogOld.STRING_NS, "waitingForAppLogs", { projectName }),
        );
        // update will be invoked when we get a container-logs event
    }

    public async update(contents: string): Promise<void> {
        if (!this.doUpdate) {
            Log.e("Update was invoked on an applog with doUpdate=false, this should never happen!");
        }

        if (!this.initialized) {
            this.initialized = true;
            this.outputChannel.clear();
        }

        let newContents;
        const diff = contents.length - this.previousLength;
        if (diff === 0) {
            // no new output
            return;
        }
        else if (diff < 0) {
            // the log was cleared, eg due to container restart
            this.outputChannel.clear();
            newContents = contents;
        }
        else {
            // get only the new output
            newContents = contents.substring(this.previousLength, contents.length);
        }

        this.outputChannel.append(newContents);
        this.previousLength = contents.length;
        this.onChange();
    }
}
