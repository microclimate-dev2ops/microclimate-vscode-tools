#!/usr/bin/env bash
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