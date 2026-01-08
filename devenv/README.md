## CCIP16Devenv Implementation for TON network 

Download [chainlink-ccip](https://github.com/smartcontractkit/chainlink-ccip) repository, build the CLI and run

```bash
cd devenv
just cli
ccip up env.toml,../../chainlink-ton/devenv/ton.toml # static CL node version
ccip up env.toml,env-cl-rebuild.toml,../../chainlink-ton/devenv/ton.toml # rebuild CL node
ccip test smoke
```

## Contract Version

### Prebuilt Contracts

To use a different contract version, set the `DEPLOY_CONTRACT_VERSION` environment variable to the desired commit hash from the [releases](https://github.com/smartcontractkit/chainlink-ton/releases) before running the deployment.

### Local Build

To use locally build contracts, set the `DEPLOY_CONTRACT_VERSION` environment variable to `local` before running the deployment. The contracts must exist at `chainlink-ccip/contracts/build` for the `devenv` to pick them up.