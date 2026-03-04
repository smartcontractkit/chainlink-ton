# TON Explorer Architecture

This document describes the explorer command architecture in `pkg/ton/codec/debug/explorer`.

## Overview

The explorer flow is organized into five stages:

1. **CLI input normalization**
2. **Network/API connection setup**
3. **Transaction and trace discovery**
4. **Trace enrichment (actors/contracts)**
5. **Rendering/output**

## Module layout

- `explorer.go`: command wiring, `client` lifecycle, trace orchestration, actor discovery.
- `cli_args.go`: positional argument and URL/hash parsing integration (`parseCLIInput`).
- `utils.go`: explorer URL parsing (`ParseURL`).
- `format.go`: visualization format validation (`parseFormat`).
- `network_connect.go`: TON connection bootstrap (`connect`).
- `network_mylocalton.go`: Docker inspection helpers for `mylocalton`.
- `tx_lookup.go`: tx hash decoding, toncenter metadata lookups, tx search/fallback logic.
- `browser.go`: OS-specific browser opening for sequence URL mode.

## Request lifecycle

`GenerateExplorerCmd` parses args and flags, creates a `client` with `Connect`, and runs `PrintTrace`.

`PrintTrace` performs:

1. Resolve root tx hash from toncenter when supported (`mainnet`/`testnet`).
2. Resolve sender address:
   - from user input when provided,
   - from toncenter when hash-only mode is used on supported networks.
3. Locate transaction from account history (paged liteclient scan), with toncenter metadata fallback when available.
4. Convert transaction to trace root (`tracetracking.MapToReceivedMessage`) and wait for full trace (`WaitForTrace`).
5. Query contract actors via `typeAndVersion` getter.
6. Render either tree or sequence output.
7. For sequence URL mode, open Mermaid URL in browser.

## Toncenter behavior

Toncenter is treated as an optional dependency by network:

- `mainnet`/`testnet`: toncenter is used for trace-root and tx metadata resolution.
- `mylocalton` or custom config URL networks: toncenter fallback is unavailable.
  - Hash-only mode requires explicit source address in these environments.

## Extension points

For maintainability, keep future changes aligned with existing seams:

- Input parsing changes in `cli_args.go`/`utils.go`.
- New visualization output options in `format.go` + rendering branch in `PrintTrace`.
- Network-specific bootstrap logic in `network_connect.go`.
- External metadata providers in `tx_lookup.go`.
- Browser side-effects in `browser.go`.

## Compatibility contract

Current trace CLI contract is:

- `explorer trace <url>`
- `explorer trace <tx-hash> <address>`
- `explorer trace <tx-hash>` (works when address can be resolved via toncenter)

`--address` and `--tx` flags were removed because they were unused and misleading.
