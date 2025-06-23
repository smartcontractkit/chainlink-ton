#!/usr/bin/env bash
# This testing script is used to run tests for the TonUtils packages.

# Test first package
nix develop .#contracts -c go test -v -parallel 1 -timeout 30m

# Wait for docker container to stop
sleep 30

pushd async
nix develop .#contracts -c go test -v -parallel 1 -timeout 30m
popd