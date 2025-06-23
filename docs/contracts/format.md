# Chainlink TON - Smart Contracts - Format

In the [contracts](../../contracts/) directory there is both Tact and Typescript code. The following commands allow you to check for formatting errors and correct them. These should be run inside the contracts directory.

## TODO: Check if Tolk language formatting is available

## Tact

Check for formatting errors:
```bash
nix develop .#contracts -c yarn fmt-contracts:check
```
Correct formatting errors:
```bash
nix develop .#contracts -c yarn fmt-contracts
```

## Typescript
Check for formatting errors:
```bash
nix develop .#contracts -c yarn fmt-typescript:check
```
Correct formatting errors:
```bash
nix develop .#contracts -c yarn fmt-typescript
```


