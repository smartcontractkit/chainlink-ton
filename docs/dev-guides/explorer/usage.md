---
id: dev-guides-explorer-usage
title: Usage
sidebar_label: Usage
sidebar_position: 3
---

# TON Explorer Usage Guide

Command-line tool for analyzing TON blockchain transactions and traces.

## Usage

Three ways to run:

1. **URL**: `./explorer <tonscan-url>`
2. **Hash + Address**: `./explorer <tx-hash> <address>`
3. **Hash only**: `./explorer <tx-hash>` (testnet/mainnet only)

## Run with Nix

The `explorer` binary is packaged with `chainlink-ton-extras` pkg bundle.

We can start a dev shell including specific pkg contents and execute a bash cmd:

```bash
nix shell .#chainlink-ton-extras -c explorer https://testnet.tonscan.org/tx/<tx-hash>
```

## Build

```bash
cd cmd/explorer
go build
```

## Examples

```bash
# URL (recommended)
./explorer https://testnet.tonscan.org/tx/<tx-hash>
./explorer http://localhost:8080/transaction?account=<account_addr>&hash=<tx-hash>

# Hash + address
./explorer <tx-hash> <address> [--net testnet|mainnet|mylocalton|http://custom-domain/global.config.json]

# Hash only (auto-resolves address)
./explorer <tx-hash> [--net testnet|mainnet|mylocalton|http://custom-domain/global.config.json]
```

## Networks

Choose the network with `-n`/`--net` flag:

- `--net testnet` (default)
- `--net mainnet`
- `--net mylocalton` (auto-discovers Docker containers)
- `--net http://custom-domain/global.config.json`

## Output Formats

**Sequence diagram**

Display message flow as a sequence diagram in [Mermaid](https://www.mermaidchart.com/) format

Available options:

- `--visualization sequence --format url` (default): URL to [Mermaid Playground Editor](https://mermaid.play/) with preloaded diagram
- `--visualization sequence --format raw`: Raw Mermaid syntax

**Tree view**

Display message trace as a tree structure with `--visualization tree`.

## Options

```bash
--verbose                    # Show debugging information
--page-size 10 --max-pages 10 # Control transaction search pagination
```

## Environment injection

The same cli is exposed in [chainlink-deployments's repo](https://github.com/smartcontractkit/chainlink-deployments/tree/main/domains/ccip/cmd) which injects contract metadata from the DataStore.

## Debugging Functionality

### Human-readable addresses

The explorer will try to match contract addresses to known contracts. It will first look into the injected contracts map, and then fallback to calling the `typeAndVersion` getter on the contract. If none of these methods work, the explorer will try to match the contract to known types with its code hash.

### Payload decoding

The explorer will try to decode message payloads for known contracts. It currently supports:

- Jetton wallet and minter
- Router
- OnRamp
- FeeQuoter
- SendExecutor

Read [TON Explorer Development Guide](./development.md) to learn how to add support for more contracts.
