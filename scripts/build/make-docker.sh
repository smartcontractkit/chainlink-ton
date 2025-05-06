#!/usr/bin/env bash

set -euo pipefail

# Build the plugin Nix package
export LOCAL_PLUGIN_PKG_DIR=$(nix build .#chainlink-ton --print-out-paths)

# Source the version of the plugin from the package shared metadata
export LOCAL_PLUGIN_VERSION=$(cat $LOCAL_PLUGIN_PKG_DIR/share/.version)

# Build the final Docker image by layering in the plugin bin on top of base chainlink:*-plugins image
docker build $LOCAL_PLUGIN_PKG_DIR \
    -t smartcontract/chainlink-plugins-dev:$LOCAL_PLUGIN_VERSION-chainlink-ton \
    -f https://raw.githubusercontent.com/smartcontractkit/chainlink/dd69fc589255c00e9cb23c5631a1e7e56c408e78/plugins/chainlink.prebuilt.Dockerfile \
    --build-arg BASE_IMAGE=public.ecr.aws/chainlink/chainlink:v2.23.0-plugins \
    --build-arg LOCAL_PLUGIN_DIR=./bin \
    --build-arg LOCAL_LIB_DIR=./lib
