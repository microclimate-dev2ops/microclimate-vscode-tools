#!/usr/bin/env bash

# To be run from the repository root directory
# $artifact_name must be set and the file it points to must be in the working directory

if [[ "$force_deploy" != "true" && "$TRAVIS_EVENT_TYPE" != "cron" ]]; then
    echo "$(basename $0): not a cronjob, skipping deploy"
    exit 0
fi

# Builds can be either "nightly" or "release"
if [[ "$release" == "true" ]]; then
    tag="RC-$(date +'%F-%H%M')"
    deploy_dir="release"
else
    tag="nightly-$(date +'%F-%H%M')"
    deploy_dir="nightly"
fi

echo "Build tag is $tag"

# Update the last_build file linking to the most recent vsix
build_info_file="last_build.html"
#build_date="$(date +'%F_%H-%M_%Z')"
commit_info="$(git log $TRAVIS_BRANCH -3 --pretty='%h by %an - %s<br>')"
artifact_link="<a href=\"./$tagged_artifact_name\">$tagged_artifact_name</a>"
printf "Last build: $artifact_link<br><br><b>Latest commits on $TRAVIS_BRANCH:<b><br>$commit_info" > "$build_info_file"

artifactory_path="$artifactory_url/$deploy_dir"
artifactory_cred_header="X-JFrog-Art-Api: $artifactory_apikey"

artf_resp=$(curl -X PUT -sS -H "$artifactory_cred_header" -T "$tagged_artifact_name" "$artifactory_path/$tagged_artifact_name"
echo "$artf_resp"

if [[ "$artf_resp" != *"created"* ]]; then
    >&2 echo "Artifactory deploy failed!"
    exit 1
fi

curl -X PUT -sS  -H "$artifactory_cred_header" -T "$build_info_file" "$artifactory_path/$build_info_file"