# Chainlink TON - Smart Contracts - Build

### Build `chainlink-contracts-ton` Nix package:

```bash
nix build .#chainlink-contracts-ton --print-out-paths # labeled pkg
```

### Build `chainlink-contracts-ton` Nix package without checking out the source code locally:

```bash
nix build 'git+ssh://git@github.com/smartcontractkit/chainlink-ton'#chainlink-contracts-ton --print-out-paths # labeled pkg
```

### Build manually:

```bash
# Enter the specific #contracts dev shell
nix develop .#contracts
# Build the contracts module
pushd contracts
yarn
yarn build
```
