#!/usr/bin/env bash

#*******************************************************************************
# Copyright (c) 2019 IBM Corporation and others.
# All rights reserved. This program and the accompanying materials
# are made available under the terms of the Eclipse Public License v2.0
# which accompanies this distribution, and is available at
# http://www.eclipse.org/legal/epl-v20.html
#
# Contributors:
#     IBM Corporation - initial API and implementation
#*******************************************************************************

if [[ -z "$microclimate_version" ]]; then
    echo "\$microclimate_version must be set in the environment, eg \"19.01\""
    exit 1
fi

set -ex

curl -f -sS https://microclimate-dev2ops.github.io/download/microclimate-${microclimate_version}.zip -o microclimate.zip
unzip -q microclimate.zip

cd microclimate-*/cli
sudo ./install.sh
cd -

mcdev start
