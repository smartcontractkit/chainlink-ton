# syntax = docker/dockerfile:1.4

# Notice: this is a fork from https://github.com/docker/babashka-pod-docker/blob/main/Dockerfile.nix
FROM nixos/nix:latest AS builder

# Build the 'default' pkg if not set
ARG NIX_BUILD_PKG=default
ENV NIX_BUILD_PKG=${NIX_BUILD_PKG}

WORKDIR /tmp/build
RUN mkdir /tmp/nix-store-closure

RUN \
    --mount=type=cache,target=/nix,from=nixos/nix:latest,source=/nix \
    --mount=type=cache,target=/root/.cache \
    --mount=type=bind,target=/tmp/build \
    <<EOF
  nix \
    --extra-experimental-features "nix-command flakes" \
    --extra-substituters "http://host.docker.internal?priority=10" \
    --option filter-syscalls false \
    --show-trace \
    --log-format raw \
    build .#${NIX_BUILD_PKG} --out-link /tmp/output/result
  # Evaluate the build result closure (runtime dependencies)
  cp -R $(nix-store -qR /tmp/output/result) /tmp/nix-store-closure
  # Evaluate and copy the symlink contents (build output)
  cp -R /tmp/output/result/ /tmp/build-output
EOF
