# Microclimate Developer Tools for VSCode

[![Build Status](https://travis.ibm.com/dev-ex/microclimate-vscode.svg?token=jLZpzPrJozeLHsb1tpsR&branch=master)](https://travis.ibm.com/dev-ex/microclimate-vscode)

This is the Git repository top-level README.

For the README packaged with this extension, see [the extension README](https://github.ibm.com/dev-ex/microclimate-vscode/tree/master/dev/README.md)

## How to install
1. [Download the newest build from the build branch](https://github.ibm.com/dev-ex/microclimate-vscode/raw/build/vscode-microclimate-tools-0.0.2.vsix)
2. In VSCode, go `View` > `Extensions` > `...` overflow menu > `Install from VSIX...`

## How to use
- Open the Microclimate Projects view within the Explorer view group (`Ctrl/Cmd + Shift + E`),
    - Right-click to create a default local connection.
    - Right-click a project to see the actions available (see below)
- Open the Command Pallete (`Ctrl/Cmd + Shift + P`) and type "Microclimate" to see the actions available

## Features
- View all projects in Microclimate, including their app and build statuses
    - No linking required
    - All projects are always visible, and the list updates automatically
- Debug **Microprofile, Spring, and Node** Microclimate projects
- Integrate Microclimate validation errors into the VSCode Problems view
- Open a shell session into a Microclimate application container
- View project info (similar to Microclimate Overview page)
- Toggle project auto-build
- Easily scope your VSCode workspace to a Microclimate project or your `microclimate-workspace`
- Open applications in system browser
- View application and build logs
- Kick off application builds
- Disable and Enable projects

## Screenshots

![Project Actions:](https://github.ibm.com/dev-ex/microclimate-vscode/raw/master/img/project-context.png)