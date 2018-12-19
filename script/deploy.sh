#!/usr/bin/env bash

# To be run from the repository root directory
# $artifact_name must be set and the file it points to must be in the working directory

if [[ "$force_deploy" != "true" && "$TRAVIS_EVENT_TYPE" != "cron" ]]; then
    echo "$(basename $0): not a cronjob, skipping deploy"
    exit 0
fi

if [[ -z "$dhe_user" || -z "$dhe_pw" ]]; then
    >&2 echo "Missing DHE credentials!"
    exit 1
elif [[ -z "$dhe_internal_path" || -z "$dhe_external_path" ]]; then
    >&2 echo "Missing DHE path!"
    exit 1
fi

# Builds can be either "nightly" or "release"
if [[ "$release" == "true" ]]; then
    tag="RC-$(date +'%F-%H%M')"
    dhe_dir="release"
else
    tag="nightly-$(date +'%F-%H%M')"
    dhe_dir="nightly"
fi

echo "Build tag is $tag"

# Will resolve to something like "microclimate-tools-18.12.0_nightly-2018-12-07-2330.vsix"
tagged_artifact_name="${artifact_name/.vsix/_$tag.vsix}"
mv -v "$artifact_name" "$tagged_artifact_name"

# Install sshpass so we don't have to interact with a password prompt
# Will fail on non-ubuntu systems
echo "Installing sshpass..."
sudo apt-get update >/dev/null
sudo apt-get install -y sshpass >/dev/null
if [[ $? -eq 0 ]]; then
    echo "Installed sshpass"
else
    >&2 echo "Failed to install sshpass"
    exit 1
fi

# Update the last_build file linking to the most recent vsix
build_info_file="last_build.html"
#build_date="$(date +'%F_%H-%M_%Z')"
commit_info="$(git log master -3 --pretty='%h by %an - %s<br>')"
artifact_link="<a href=\"./$tagged_artifact_name\">$tagged_artifact_name</a>"
printf "Last build: $artifact_link<br>
    Latest commits:<br>
    $commit_info"
    > "$build_info_file"

pw_file=".password"
echo $dhe_pw > $pw_file

# DHE upload
# we have "nightly" and "release" dirs, append one of those
dhe_external_path=${dhe_external_path}/${dhe_dir}
echo "Uploading to ${dhe_external_path}"
dhe_remote_dir=${dhe_ip}:${dhe_internal_path}${dhe_external_path}
sshpass -f $pw_file scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null $tagged_artifact_name $build_info_file $dhe_user@$dhe_remote_dir

if [[ $? -eq 0 ]]; then
    dhe_external_host="https://public.dhe.ibm.com/ibmdl/"
    dhe_external_url="${dhe_external_host}${dhe_external_path}"
    echo "Upload succeeded. Artifact will available at $dhe_external_url at the top of the hour."
else
    >&2 echo "Upload failed!"
    exit 1
fi