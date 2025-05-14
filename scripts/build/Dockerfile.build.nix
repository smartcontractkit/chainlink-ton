# Notice: this is a fork from https://github.com/docker/babashka-pod-docker/blob/main/Dockerfile.nix
# syntax = docker/dockerfile:1.4

# Takes Chainlink core as a base image and layers in plugins
ARG BASE_IMAGE=public.ecr.aws/chainlink/chainlink:v2.23.0-plugins
# Build the 'default' pkg if not set
ARG NIX_BUILD_PKG=default

FROM nixos/nix:latest AS builder

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
  cp -R /tmp/output/result/ /tmp/nix-build-output
EOF

# Final image
FROM ${BASE_IMAGE} AS final

COPY --from=builder /tmp/nix-store-closure /nix/store
COPY --from=builder /tmp/nix-build-output /usr/local
