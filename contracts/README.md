# Chainlink TON - Smart Contracts

## Project structure

- `contracts` - source code of all the smart contracts of the project and their dependencies.
- `wrappers` - wrapper classes (implementing `Contract` from ton-core) for the contracts, including any [de]serialization primitives and compilation functions. In practice we use the auto-generated typescript bindings under `build/`, so file under wrappers only re-export those.
- `tests` - tests for the contracts.
- `scripts` - scripts used by the project.

## Documentation
Refer to the [Contracts Documentation](../docs/contracts)
