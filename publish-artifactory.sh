#!/usr/bin/env bash

# To be run from the repository root directory
# $tagged_artifact_name must be set and the file it points to must be in the working directory

if [[ "$do_artifactory_deploy" != "true" ]]; then
    echo "$(basename $0): do_artifactory_deploy is not set to 'true', skipping."
    exit 0
fi

set -e

build_info_file="last_build.txt"
build_date="$(date +'%F_%H-%M_%Z')"
commit_info="$(git log master -3 --pretty='%h by %an - %s')"

artifactory_path="$artifactory_url/"

if [[ "$tagged_artifact_name" == *"nightly"* ]]; then
    artifactory_path="${artifactory_path}nightlies/"
fi

# Artifactory upload
printf "Last build: $tagged_artifact_name at $build_date\n\nLatest commits:\n$commit_info" > "$build_info_file"

artf_resp=$(curl -X PUT -sS -u "$user_email:$artifactory_apikey" "$artifactory_path/$tagged_artifact_name" -T "$tagged_artifact_name")

if [[ "$artf_resp" != *"created"* ]]; then
    >&2 echo "Artifactory deploy failed!"
    >&2 echo "$artf_resp"
    exit 1
else
    echo "$artf_resp"
fi

curl -X PUT -sS -u "$user_email:$artifactory_apikey" "$artifactory_path/$build_info_file" -T "$build_info_file"
