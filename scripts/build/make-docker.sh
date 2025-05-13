#!/usr/bin/env bash
# This script builds the plugin Docker image by layering the plugin bin on top of the base chainlink:*-plugins image.
# It can be run in two ways:
# 1. By passing the --docker-builder argument, which will build the image using the Docker builder.
# 2. By not passing the --docker-builder argument, which will build the image using the host's Nix package manager.

set -euo pipefail

# TODO: make arguments to this script configurable
PKG=chainlink-ton
BASE_IMAGE=public.ecr.aws/chainlink/chainlink:v2.23.0-plugins

# Get the root directory of the repository
ROOT_DIR=$(git rev-parse --show-toplevel)

# Source the version of the plugin from the root package.json
export PKG_VERSION=$(jq -r '.version' ${ROOT_DIR}/package.json)

# Check if --docker-builder is passed as an argument (build with Docker builder)
if [[ "$*" == *"--docker-builder"* ]]; then
    # Use the Docker builder
    docker build . \
        -t smartcontract/chainlink-plugins-dev:$PKG_VERSION-$PKG \
        -f ./scripts/build/Dockerfile.build.nix \
        --build-arg BASE_IMAGE=$BASE_IMAGE

    exit 0
fi

# Build the plugin Nix package (build on the host)
export PKG_OUT_PATH=$(nix build .#$PKG --print-out-paths)

# Build the final Docker image by layering in the plugin bin on top of base chainlink:*-plugins image
docker build $PKG_OUT_PATH \
    -t smartcontract/chainlink-plugins-dev:$PKG_VERSION-$PKG \
    -f https://raw.githubusercontent.com/smartcontractkit/chainlink/refs/heads/develop/plugins/chainlink.prebuilt.Dockerfile \
    --build-arg BASE_IMAGE=$BASE_IMAGE \
    --build-arg PKG_PATH=. # This is the path to the local context from which bin/libs are copied into the image
