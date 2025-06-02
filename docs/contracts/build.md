# Chainlink TON - Smart Contracts - Build

## Building the contracts

We use Blueprint to compile our tact contracts. Refer to the [Blueprint build documentation](https://github.com/ton-org/blueprint#building-contracts). To build a contract, a file ending in `.compile.ts` must be placed under `wrappers` in the blueprint project's directory.

```bash
# Build the contracts module
pushd contracts
yarn
yarn build
```

## Nix build

You can also build a `contracts` Nix package:

```bash
nix build .#contracts --print-out-paths # labeled pkg
```

Build `contracts` Nix package without checking out the source code locally:

```bash
nix build 'git+ssh://git@github.com/smartcontractkit/chainlink-ton'#contracts --print-out-paths # labeled pkg
```
