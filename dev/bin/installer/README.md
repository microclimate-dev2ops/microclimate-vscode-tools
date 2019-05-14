# tempest-installer

https://github.ibm.com/dev-ex/tempest-installer/tree/v0.1.1-installer

## Instructions for downloaded release binary (MacOS)
1. Download the release binary file to a folder on your system
2. `cd` to that directory in a terminal
3. If the binary file has the extention `.dms` remove this so it is just called `installer`
4. Give yourself access rights to execute the binary file on your system - `chmod 775 installer`
5. Export environment variables for artifactory authentication
```
$ export USER=<artifactory-username>
$ export PASS=<artifactory-API-key>
```
6. Copy your microclimate workspace into your home directory - `/Users/<username>`
7. Type `./installer` in the terminal shell with the exported environment varibles to run the installer
8. To run a command - `./installer <command>`

## Instructions for local build and deployment (MacOS)
1. Ensure you have a Go environment set up. Follow this short tutorial - https://nats.io/documentation/tutorials/go-install/
2. Install dep for **MacOS**
```
$ brew install dep
$ brew upgrade dep
```

3. Clone this repo - `git clone git@github.ibm.com:dev-ex/tempest-installer.git`
4. `cd` into the project directory and install the vendor packages `dep ensure -v`
5. Build the binary and give it a name `go build -o <binary-name>`
6. Export environment variables for artifactory authentication
```
$ export USER=<artifactory-username>
$ export PASS=<artifactory-API-key>
```
7. Copy your microclimate workspace into your home directory - `/Users/<username>`
8. Type `./<binary-name>` in the terminal shell with the exported environment varibles to run the installer
9. To run a command - `./<binary-name> <command>`

 ## The installer for Tempest on Kubernetes

See https://github.ibm.com/dev-ex/che-docs/wiki/Installing-Eclipse-Che-on-Kubernetes for instructions on installing
