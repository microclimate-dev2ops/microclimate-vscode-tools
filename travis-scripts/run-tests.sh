#!/usr/bin/env bash


# Assumes working directory is dev/ (since this is where package.json is for npm test)

if [[ "$skip_tests" != "true" ]]; then
    set -ex

    sudo -E ../travis-scripts/install-microclimate.sh

    export CODE_TESTS_WORKSPACE="${HOME}/microclimate-workspace/"

    # https://stackoverflow.com/a/29903645/
    n=$(which node)
    n=${n%/bin/node}
    chmod -R 755 $n/bin/*
    sudo cp -r $n/{bin,lib,share} /usr/local

    sudo -E $(which npm) test --verbose
else
    echo "skip_tests is true, skipping tests";
fi

