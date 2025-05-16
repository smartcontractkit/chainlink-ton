# Chainlink TON - LOOP plugin - Release

## Build & publish a Docker image

Docker images are automatically built and published to the internal staging `chainlink-plugins-dev` ECR with a specific tag.

The [build-publish-docker](../../.github/workflows/relayer-publish.yml) CI workflow is triggered on every tag and commit to the `main` branch. Additionally, it will also build and publish PR commits if the PR has a specific `build-publish-docker` label attached. The build process builds the specified (or default) repository package, using [a Docker/Nix builder](../../scripts/build/Dockerfile.build.nix), and layers in the output artifact on top of the official Chainlink plugins image (Dockerfile: ARG BASE_IMAGE).

Once the label is set, a multi-arch image will be built by the [smartcontrackit/.github/workflows/reusable-docker-build-publish](https://github.com/smartcontractkit/.github/blob/main/.github/workflows/reusable-docker-build-publish.yml) shared CI workflow, and published: `***.dkr.ecr.us-west-2.amazonaws.com/chainlink-plugins-dev:pr-<pr-num>-<sha-short>-chainlink-ton`

*Notice:* This is the internal channel; for the official channel, please use the [chainlink core repo build/release channel](https://github.com/smartcontractkit/chainlink/blob/develop/plugins/plugins.public.yaml).
