# TON Explorer Usage Guide

Command-line tool for analyzing TON blockchain transactions and traces.

Read [TON Explorer Architecture](./architecture.md) for internal module layout and execution flow.

## Usage

Four ways to run:

1. **URL**: `./explorer trace <tonscan-url>`
2. **Hash + Address**: `./explorer trace <tx-hash> <address>`
3. **Hash only**: `./explorer trace <tx-hash>` (testnet/mainnet only unless sender address is provided separately)
4. **Getter call**: `./explorer get <address> [getter_name] [args...]`

## Run with Nix

The `explorer` binary is packaged with `chainlink-ton-extras` pkg bundle.

We can start a dev shell including specific pkg contents and execute a bash cmd:

```bash
nix shell .#chainlink-ton-extras -c explorer trace https://testnet.tonscan.org/tx/<tx-hash>
```

## Build

```bash
cd cmd/explorer
go build
```

## Examples

```bash
# URL (recommended)
./explorer trace https://testnet.tonscan.org/tx/<tx-hash>
./explorer trace http://localhost:8080/transaction?account=<account_addr>&hash=<tx-hash>

# Hash + address
./explorer trace <tx-hash> <address> [--net testnet|mainnet|mylocalton|http://custom-domain/global.config.json]

# Hash only (auto-resolves address via toncenter on testnet/mainnet)
./explorer trace <tx-hash> [--net testnet|mainnet|mylocalton|http://custom-domain/global.config.json]

# Getter call
./explorer get <address> [getter_name] [args...] [--arg name=value] [--net testnet|mainnet|mylocalton|http://custom-domain/global.config.json] [--contract-type <type>]

# Example
./explorer get EQA-CUZI_USus4w0_Erf-wTj5uhaAR7XldEimU0w0WAJGGod dynamicConfig
```

## Getter command

`explorer get` supports no-args and argument-based getters and prints decoded JSON output.

When `getter_name` is omitted in an interactive terminal, explorer opens a numbered selector prompt (`0` to cancel).
When a selected getter requires arguments and values are missing, explorer prompts for those values.

The command tries to infer the contract type by calling `typeAndVersion` on the target address.
If inference is unavailable/fails, pass `--contract-type` explicitly.

Examples:

```bash
# auto-detect contract type
./explorer get <address> owner

# explicit contract type
./explorer get <address> owner --contract-type link.chain.ton.ccip.OnRamp

# positional args
./explorer get <router-address> onRamp 16015286601757825753

# named args
./explorer get <timelock-address> getRoleMember --arg role=1 --arg index=0
```

## Autocomplete setup

The explorer uses Cobra shell completion, including dynamic getter completion for:

`explorer get <address> <TAB>`

### zsh (current shell only)

```bash
source <(./explorer completion zsh)
```

### zsh (persistent)

```bash
mkdir -p ~/.zfunc
./explorer completion zsh > ~/.zfunc/_explorer
```

Add this to `~/.zshrc`:

```bash
fpath=(~/.zfunc $fpath)
autoload -Uz compinit
compinit
```

Reload:

```bash
source ~/.zshrc
```

If you run the local binary directly from this repository, add an alias in `~/.zshrc`:

```bash
alias explorer="/Users/patricio.passarino/Code/ton/chainlink-ton-explorer/explorer"
```

Then you can tab-complete getter names for a contract address.

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
--contract-type <type>       # (get command) optional contract type override
--arg name=value             # (get command) named getter argument (repeatable)
```

Note: `--address` and `--tx` flags are not supported; use positional arguments.

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
