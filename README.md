# Microclimate Developer Tools for VS Code

[![Build Status](https://travis-ci.com/microclimate-dev2ops/microclimate-vscode-tools.svg?token=wpsJvyUkyhtfRa9prmMq&branch=master)](https://travis-ci.com/microclimate-dev2ops/microclimate-vscode-tools)
[![License](https://img.shields.io/badge/License-EPL%202.0-red.svg)](https://www.eclipse.org/legal/epl-2.0/)
[![Marketplace](https://img.shields.io/vscode-marketplace/v/IBM.microclimate-tools.svg)](https://marketplace.visualstudio.com/items?itemName=IBM.microclimate-tools)

- **[Marketplace](https://marketplace.visualstudio.com/items?itemName=IBM.microclimate-tools)**
- **[Documentation](https://microclimate-dev2ops.github.io/mdt-vsc-overview)**
- **[Slack](https://slack-invite-ibm-cloud-tech.mybluemix.net/)**
- **[Extension README](https://github.com/microclimate-dev2ops/microclimate-vscode-tools/blob/master/dev/README.md)**

You can use Microclimate Developer Tools for Visual Studio Code to develop your [Microclimate](https://microclimate-dev2ops.github.io) projects from within VS Code. Use the tools to access Microclimate features in the comfort of your IDE.

## How to install [(Documentation)](https://microclimate-dev2ops.github.io/mdt-vsc-getting-started)

1. Install [VS Code version 1.27 or later](https://code.visualstudio.com/download) and [local Microclimate version 18.12 or later](https://microclimate-dev2ops.github.io/installlocally).
2. Install Microclimate Developer Tools for VS Code from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=IBM.microclimate-tools) or by searching for "Microclimate" in the [VS Code Extensions view](https://code.visualstudio.com/docs/editor/extension-gallery#_browse-for-extensions).

If you want to host or build the extension yourself, see [Contributing](#contributing).

## How to use [(Documentation)](https://microclimate-dev2ops.github.io/mdt-vsc-tutorial)
- Navigate to the **Explorer** view group and open the **Microclimate** view.
    - Right-click the background of the Microclimate view to access the **New connection** commands.
    - Right-click a connection or project to access the other commands.
- Open the **Command Palette** keys and type "Microclimate" to see the actions available.

## Features [(Documentation)](https://microclimate-dev2ops.github.io/mdt-vsc-commands-overview)
- View all projects in Microclimate, including application and build statuses.
- Debug Microprofile, Spring, and Node.js Microclimate projects.
- View application and build logs in the VS Code **Output** view.
- View project information similar to the information on the Microclimate **Overview** page.
- Integrate Microclimate validation errors into the VS Code **Problems** view.
- Open a shell session into a Microclimate application container.
- Toggle project auto build and manually initiate project builds.
- Scope your VS Code workspace to a Microclimate project or to your `microclimate-workspace`.
- Disable, enable, and delete projects.

## Contributing
We welcome [issues](https://github.com/microclimate-dev2ops/microclimate-vscode-tools/issues) and contributions. For more information, see [CONTRIBUTING.md](https://github.com/microclimate-dev2ops/microclimate-vscode-tools/tree/master/CONTRIBUTING.md).

Development builds are available [here](https://public.dhe.ibm.com/ibmdl/export/pub/software/microclimate/vscode-tools/nightly/). Follow the [Install from a VSIX](https://code.visualstudio.com/docs/editor/extension-gallery#_install-from-a-vsix) instructions to install a `.vsix`.

To host the extension yourself so you can develop or debug it, clone this repository and run the **Extension** launch in `dev/.vscode/launch.json`. See [Developing Extensions](https://code.visualstudio.com/docs/extensions/developing-extensions) for more information.

You can also build the extension `.vsix` yourself by running `vsce package` from `dev/`. Refer to the `before_install` and `script` sections of [`.travis.yml`](https://github.com/microclimate-dev2ops/microclimate-vscode-tools/blob/master/.travis.yml) to see the exact steps the build runs.
