# syntax = docker/dockerfile:1.4

# Notice: this is a fork from https://github.com/docker/babashka-pod-docker/blob/main/Dockerfile.nix
FROM nixos/nix:latest AS chainlink-builder

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

# normalize the builder output for standard chainlink image build
# ensure all folders exist and libs are available in /tmp/lib
RUN mkdir -p /gobins /tmp/lib && cp -a /tmp/build-output/lib/. /tmp/lib/ 2>/dev/null || true

##
# Build image: Chainlink binary with plugins for testing purposes only.
# XXX: Experimental -- not to be used to build images for production use.
# See: ../core/chainlink.Dockerfile for the production Dockerfile.
##
FROM ubuntu:24.04

ARG CHAINLINK_USER=root
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y ca-certificates gnupg lsb-release curl && rm -rf /var/lib/apt/lists/*

# Install Postgres for CLI tools, needed specifically for DB backups
RUN curl https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - \
  && echo "deb http://apt.postgresql.org/pub/repos/apt/ `lsb_release -cs`-pgdg main" |tee /etc/apt/sources.list.d/pgdg.list \
  && apt-get update && apt-get install -y postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*

# keep user creation as before (we will run detector as root BEFORE switching to user)
RUN if [ ${CHAINLINK_USER} != root ]; then useradd --uid 14933 --create-home ${CHAINLINK_USER}; fi

# TODO: figure out how to pass these at build time whithout baking in specific context
# # CCIP specific
# COPY ./cci[p]/confi[g] /ccip-config
# ARG CL_CHAIN_DEFAULTS
# ENV CL_CHAIN_DEFAULTS=${CL_CHAIN_DEFAULTS}

# copy Nix closure (may be empty for non-nix builders)
COPY --from=chainlink-builder /tmp/nix-store-closure /nix/store
# copy normalized build output into /usr/local (bins -> /usr/local/bin, libs -> /usr/local/lib)
COPY --from=chainlink-builder /tmp/build-output/ /usr/local/
# copy gobins as a fallback (some builders may put binaries here)
COPY --from=chainlink-builder /gobins/ /usr/local/bin/
# copy normalized libs (some builders may put libs directly here)
COPY --from=chainlink-builder /tmp/lib/ /usr/lib/

# Chainlink plugins detector (build-time) and entrypoint (runtime)
# Notice: detect-plugins-prep-env-setup.sh will generate /etc/chainlink/env-setup.sh
COPY ./scripts/build/detect-plugins-prep-env-setup.sh ./scripts/build/entrypoint-chainlink.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/detect-plugins-prep-env-setup.sh /usr/local/bin/entrypoint-chainlink.sh && \
    /usr/local/bin/detect-plugins-prep-env-setup.sh

# continue with the rest of the Dockerfile
WORKDIR /home/${CHAINLINK_USER}

# Explicitly set the cache dir. Needed so both root and non-root user has an explicit location.
ENV XDG_CACHE_HOME=/home/${CHAINLINK_USER}/.cache
RUN mkdir -p ${XDG_CACHE_HOME}

# switch to unprivileged user for runtime
USER ${CHAINLINK_USER}

EXPOSE 6688
ENTRYPOINT ["/usr/local/bin/entrypoint-chainlink.sh"]
HEALTHCHECK CMD curl -f http://localhost:6688/health || exit 1
CMD ["local", "node"]
