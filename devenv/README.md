## CCIP16Devenv Implementation for TON network 

Download [chainlink-ccip](https://github.com/smartcontractkit/chainlink-ccip) repository, build the CLI and run

```bash
cd devenv
just cli
ccip up env.toml,../../chainlink-ton/devenv/ton.toml # static CL node version
ccip up env.toml,env-cl-rebuild.toml,../../chainlink-ton/devenv/ton.toml # rebuild CL node
ccip test smoke
```
