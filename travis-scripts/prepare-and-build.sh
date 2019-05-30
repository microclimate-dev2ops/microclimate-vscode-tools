#!/usr/bin/env bash

set -ex

code --version
code --install-extension "vscjava.vscode-java-debug" --force
# Working directory must be dev/ (since this is where package.json is)
# Make sure to cd - before exiting
cd "$(dirname $0)/../dev"
npm run vscode:prepublish || travis_terminate 1

cd -
