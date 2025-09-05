<div align="center">

# CCIP TON Developer Environment

`NodeSet` + `Anvil` + `TON` + `Fake Server` + `JobDistributor` + `TON Product Orchestration`

</div>

## Install
Every command should be run inside [Nix](https://github.com/DeterminateSystems/nix-installer) shell, please follow the [link](https://github.com/DeterminateSystems/nix-installer) and install it.

Enter `Nix` shell and build all the Docker images initially
```
nix develop
just clean-docker-dev # needed in case you have old JD image
just build-docker-dev
```

Enter `ton` shell and follow auto-completion hints
```
ton sh
```

### Running tests
Devenv include 2 types of tests: end-to-end system-level tests and services tests
```
# run e2e smoke test, requires full environment to spin up first
ton r && go test -v -run TestE2E ./...
```

### Running tests
Devenv include 2 types of tests: end-to-end system-level tests and services tests

#### Service Tests
Go to `tests/services` directory and run
```bash
go test -v -run TestService
```

#### Smoke E2E Test
Go to `tests/e2e` directory and run
```bash
go test -v -run TestE2ESmoke
```

#### Load/Chaos Tests
Spin up the observability stack first
```bash
export LOKI_URL=http://localhost:3030/loki/api/v1/push
ton obs u
```

Go to `tests/e2e` directory and run

Clean load test
```bash
go test -v -run TestE2ELoad/clean
```

RPC latency test
```bash
go test -v -run TestE2ELoad/rpc_latency
```

Gas spikes
```bash
go test -v -run TestE2ELoad/gas
```

Reorgs (you need an env with Geth configured, `up env.toml,env-geth.toml`)
```bash
go test -v -run TestE2ELoad/reorgs
```

Services chaos
```bash
go test -v -run TestE2ELoad/services_chaos
```