# syntax = docker/dockerfile:1.4

# canonical copy from builder (BUILDER arg selects stage or external image)
ARG BUILDER=chainlink-builder

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

# TODO: this should be auto-copied from builder stage
# # Copy Delve debugger from build stage.
# COPY --from=buildgo /go/bin/dlv /usr/local/bin/dlv

# TODO: figure out how to pass these at build time whithout baking in specific context
# # CCIP specific
# COPY ./cci[p]/confi[g] /ccip-config
# ARG CL_CHAIN_DEFAULTS
# ENV CL_CHAIN_DEFAULTS=${CL_CHAIN_DEFAULTS}

# copy Nix closure (may be empty for non-nix builders)
COPY --from=${BUILDER} /tmp/nix-store-closure /nix/store
# copy normalized build output into /usr/local (bins -> /usr/local/bin, libs -> /usr/local/lib)
COPY --from=${BUILDER} /tmp/build-output/ /usr/local/
# copy gobins as a fallback (some builders may put binaries here)
COPY --from=${BUILDER} /gobins/ /usr/local/bin/
# copy normalized libs (some builders may put libs directly here)
COPY --from=${BUILDER} /tmp/lib/ /usr/lib/

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
