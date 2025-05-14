# Chainlink TON - Getting started

1. Install Nix following instructions [here](./.misc/dev-guides/nix/getting-started.md).
2. Explore developer environment
3. Build available packages

## Developer environment

Enter the developer environment using Nix:

```bash
nix develop
```

## Packages

List all available developer shells and packages with:

```bash
nix flake show
```

Build packages:

- [nix build .#chainlink-ton](./plugin/build.md)
- [nix build .#contracts](./contracts/build.md)
