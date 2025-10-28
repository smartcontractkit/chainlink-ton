#!/usr/bin/env sh
# entrypoint-chainlink.sh
# Runtime entrypoint: source generated env-setup and exec chainlink
set -eu

# Source generated env file if present
if [ -f /etc/chainlink/env-setup.sh ]; then
  # shellcheck disable=SC1090
  . /etc/chainlink/env-setup.sh
fi

# Exec chainlink to preserve signals and args
exec chainlink "$@"
