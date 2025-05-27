# Chainlink TON - Smart Contracts - Build

### Build the contracts and bindings

You must compile the contracts and generate the Typescript bindings before running the Blueprint tests. Follow the [Build instructions](./build.md) for **building manually**.

### Run the unit tests

```bash
# Enter the specific #contracts dev shell
nix develop .#contracts
# Run the Blueprint unit tests
pushd contracts
yarn
yarn test
```
