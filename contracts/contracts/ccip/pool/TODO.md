
## Overview

- Our goal is to translate token pool EVM implementation to TON/Tolk
- We will start with TokenPool.sol lib and the lock release pool
- The reimplementation in TON/Tolk should be as close as possible to EVM original, diviate only when required and where makes sense
    - Can check translation as example:
      - TVM: chainlink-ton/contracts/contracts/mcms/mcms.tolk
      - EVM: ccip-owner-contracts/src/ManyChainMultiSig.sol
- We need to build same type of core token pool lib that different instances would extend and change behaviour - we used a hooks pattern for MCMS/RBACTimelock, but Tolk didn't have closures before 1.4, should have closures at 1.4: chainlink-ton/contracts/contracts/ccip/pool/TODO.md so this can be simplified in next version.
- We want to focus on resolving the async communication correctly, costs time and gas
  - Need to authorise off/onramp calls via Router sync call on EVM - here we said we're going to authorise calls from executors, but how to support any
  - Need to call advanced hooks, this can probably stay async
  - Need to validate RMN curse, this can probably be propagated down from Router as it is with on/offramp - list of pools is going to be in pool registry, doesn't exist yet
  - As we go we want to keep updating the documentation and design in llm-wiki, specifically the section on TokenPool like "### M1.4 Token Pool Core Library (IPoolV2, hardcoded defaultFinality)" in <llm-wiki/projects/ccip/ton-token-pool-2-0-design/docs/design/m1-token-pools-foundation-lock.md>
    - We might want to extract that into a separate (per-component) design page
- As we go along want to start building a basic test harness for token pools contracts (using wTON as Jetton), and add coverage as we move forward - we should use EVM available tests as inspiration to follow the spec, as we did for MCMS
- As we go along document issues, missing-components, todos, etc. with explicit enumerated comments so we can reference them as we iterate (e.g., TON-TP/16)

## TODOs

## Iterations progress notes

1. Iteration 1
  - Added a first-pass generic TokenPool lib scaffold in `types.tolk`, `errors.tolk`, and `token_pool.tolk`.
  - Scope is intentionally the shared core only: storage layout, EVM-parity request/response structs, decimals conversion, chain config management, fee config management, rate-limiter helpers, and MCMS-style runtime hooks for access checks and concrete token movement.
  - Deliberately deferred in this pass: concrete contract entrypoints, async pending-operation state machines, lockbox integration, Jetton wallet hosting flow, Router/OnRamp/ReceiveExecutor wiring, and finality codec parity beyond the current default/single-fast-config check.

2. Iteration 2
  - Added a first concrete non-lockbox `LockReleaseTokenPool` contract on top of the generic pool lib, plus a first sandbox harness.
  - Async design choice for TVM: do not synchronously query Router or RMN from the pool. Instead, duplicate the minimum required auth/curse state locally in the pool and update it asynchronously through messages, analogous to `OffRamp_UpdateCursedSubjects`.
  - Current concrete flow:
    - outbound lock is triggered by `TransferNotificationForRecipient` on the pool wallet, not a synchronous pool call;
    - inbound release starts from `LockReleaseTokenPool_ReleaseOrMint`, creates a pending operation keyed by `queryId`, and only resolves after `ReturnExcessesBack` from the expected recipient wallet;
    - bounce handling currently covers the pool wallet transfer bounce path.
  - Still deferred: executor integration, router-owned custody flow, lockbox-backed variant, richer failure taxonomy, and a generalized pending-op state machine shared across pool variants.