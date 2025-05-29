#!/usr/bin/env bash
# Test first package
nix develop .#contracts -c go test -v -parallel 1 -timeout 30m

# Wait for docker container to stop
sleep 30

async_communication
nix develop .#contracts -c go test -v -parallel 1 -timeout 30m
popd