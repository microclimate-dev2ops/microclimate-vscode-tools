#!/usr/bin/env bash

# To be run from the repository root directory
# $tagged_artifact_name must be set and the file it points to must be in the working directory

if [[ "$do_artifactory_deploy" != "true" ]]; then
    echo "$(basename $0): do_artifactory_deploy is not set to 'true', skipping."
    exit 0
fi

set -ex

build_info_file="build_info.txt"
build_date="$(date +'%F_%H-%M_%Z')"

commit_info="$(git log master -3 --pretty='%h by %an - %s')"

# Artifactory upload
printf "$build_date\n$commit_info" > "$build_info_file"
curl -u "$artifactory_username:$artifactory_apikey" "$artifactory_url/$tagged_artifact_name" -T "$tagged_artifact_name" -X PUT
curl -u "$artifactory_username:$artifactory_apikey" "$artifactory_url/$build_info_file" -T "$build_info_file" -X PUT
