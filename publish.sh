#!/usr/bin/env bash

# To be run from the repository root directory

set -ex

if [[ "$TRAVIS_EVENT_TYPE" != "cron" ]]; then
    echo "Not a cron build; not publishing"
    exit 1
fi

cp "dev/*.vsix" .

git_repo_url="https://github.ibm.com/dev-ex/microclimate-vscode"
build_info_file="build_info.txt"


artifact_name="$(basename *.vsix)"
echo "The build artifact is $artifact_name"

build_date="$(date +'%F %H:%M %Z')"
commit_info="$(git log master -3 --pretty='%h by %an - %s')"
echo "$commit_info"

# Artifactory upload - Remove this at OSS time
printf "$build_date\n$commit_info" > "$build_info_file"
curl -u "$artifactory_username:$artifactory_apikey" "$artifactory_url/$artifact_name" -T "$artifact_name" -X PUT
curl -u "$artifactory_username:$artifactory_apikey" "$artifactory_url/$build_info_file" -T "$build_info_file" -X PUT

echo "dumb stuff";
ls -l /usr/bin/python*
ls -l /bin/python*
echo "done dumb stuff";

# https://developer.github.com/v3/repos/releases/#create-a-release
gh_payload_builder="import json; payload={};
    payload['tag_name'] = 'nightly-$build_date';
    payload['target_commitish'] = $TRAVIS_COMMIT;
    payload['prerelease'] = true;
    print json.dumps(payload);
    "
gh_tag_payload="$(python2 -c $gh_payload_builder)"
echo "$gh_tag_payload"

