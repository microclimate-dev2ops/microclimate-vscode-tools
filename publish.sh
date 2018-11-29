#!/usr/bin/env bash

# To be run from the repository root directory

set -ex

cp -v dev/*.vsix .

build_info_file="build_info.txt"
artifact_name="$(basename *.vsix)"
build_date="$(date +'%F_%H-%M_%Z')"

commit_info="$(git log master -3 --pretty='%h by %an - %s')"

# Artifactory upload
printf "$build_date\n$commit_info" > "$build_info_file"
curl -u "$artifactory_username:$artifactory_apikey" "$artifactory_url/$artifact_name" -T "$artifact_name" -X PUT
curl -u "$artifactory_username:$artifactory_apikey" "$artifactory_url/$build_info_file" -T "$build_info_file" -X PUT
