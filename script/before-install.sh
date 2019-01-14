#!/usr/bin/env bash

#*******************************************************************************
# Copyright (c) 2018, 2019 IBM Corporation and others.
# All rights reserved. This program and the accompanying materials
# are made available under the terms of the Eclipse Public License v2.0
# which accompanies this distribution, and is available at
# http://www.eclipse.org/legal/epl-v20.html
#
# Contributors:
#     IBM Corporation - initial API and implementation
#*******************************************************************************

# WD should be dev/

set -ex

#  Copy the LICENSE into the extension directory, so it is included in the build
cp -v ../LICENSE .

npm i -g vsce
npm ci

# Make sure compilation will succeed (vsce package won't show the compilation failures)
# Fail the build if compile fails
npm run compile
# Run the linter, could switch to lint-f to not fail the build
npm run lint