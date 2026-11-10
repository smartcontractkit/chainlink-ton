---
"@chainlink/contracts-ton": patch
---

Add generic one-time token pool initialization via `TokenPool_Init` and `isInitialized()`. Pools reject custody, registry-config, and CCV flows until initialized. `LockReleaseLockboxTokenPool` defers init on a `JettonLockBox_GetInfo` handshake that verifies the lockbox token, the wallet derived from `(lockbox, token, walletCode)`, and the pool's `OPERATOR_ROLE`. `JettonLockBox.onInit` now rejects a minter that differs from the stateInit commitment.

Breaking storage change: `TokenPool_Data` gains a trailing `initialized: bool`. Existing deployed pools must be redeployed or migrated; new deployments must send `TokenPool_Init`. Go bindings and TS wrappers are updated.
