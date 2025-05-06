# Chainlink TON - Smart Contracts - Build

## NPM/Tact build

Build `contracts` module/lib manually:

```bash
# Enter the specific #contracts dev shell
nix develop .#contracts
# Build the contracts module
pushd contracts
yarn
yarn build
```

## Nix build

Build `contracts` Nix package:

```bash
nix build .#contracts --print-out-paths # labeled pkg
```

Build `contracts` Nix package without checking out the source code locally:

```bash
nix build 'git+ssh://git@github.com/smartcontractkit/chainlink-ton'#contracts --print-out-paths # labeled pkg
```
