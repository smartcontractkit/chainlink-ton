<div align="center">

# CCIP TON Developer Environment

`NodeSet` + `Anvil` + `TON` + `Fake Server` + `JobDistributor` + `TON Product Orchestration`

</div>

- [Components](#components)
- [Prerequisites](#prerequisites)
- [Environment](#run-the-environment-local-chains)
    - [Local Environment](#run-the-environment-local-chains)
    - [Testnet Environment](#run-the-environment-testnets)
- [Developing](#creating-your-own-components)
    - [Creating components](#creating-your-own-components)


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

## Run the environment (testnets) (WIP)
Create `.envrc` and put the key there `export PRIVATE_KEY="..."` and select the network config
```
up env.toml,env-fuji-fantom.toml
```
TODO: add TON key for testnet here both to config and code

### Running tests
Devenv include 2 types of tests: end-to-end system-level tests and services tests
```
# run e2e smoke test, requires full environment to spin up first
ton r && go test -v -run TestE2E ./...
```