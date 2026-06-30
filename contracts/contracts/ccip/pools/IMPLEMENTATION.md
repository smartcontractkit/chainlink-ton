# TON Token Pool — Implementation Reference & Issue Register

> **Status:** MVP with basic e2e (sandbox) coverage. This document is the canonical
> as-built reference and issue tracker. It is maintained alongside the code.
> Design rationale lives in
> `llm-wiki/projects/ccip/ton-token-pool-2-0-design/` (milestones M1–M4).
>
> Issues are tracked with stable `TON-TP/N` IDs; reference them in code comments
> (e.g. `// TON-TP/4`) and commits so we can iterate.

## 1. Scope

Translation of EVM CCIP 2.0 token pools
(`chainlink-ccip/chains/evm/contracts/pools`) to TON/Tolk. We implement the
**IPoolV2** interface only (TON OnRamp/OffRamp are written from scratch, so V1
legacy compatibility is unnecessary). We follow the EVM contracts as the spec and
diverge only where the TON async execution model requires it.

## 2. Component map

| File                       | Role                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `token_pool.tolk`          | Generic core lib `TokenPool<T>` (validation, rate limiting, decimals, config, hooks). EVM `TokenPool.sol`. |
| `token_pool_contract.tolk` | Abstract contract shell / get-method + message-registration template (bindings).                           |
| `types.tolk`               | IPoolV2 request/response structs, config structs, transfer details.                                        |
| `messages.tolk`            | Inbound/outbound message opcodes (`TokenPool_InMessage` / `TokenPool_OutMessage`).                         |
| `events.tolk`              | Emitted-event topics and payloads.                                                                         |
| `errors.tolk`              | `TokenPool_Error` enum (facility-scoped codes).                                                            |
| `rate_limiter.tolk`        | Token-bucket rate limiter. EVM `RateLimiter.sol`.                                                          |
| `lock_release/`            | `LockReleaseTokenPool` — pool custodies tokens in its own Jetton wallet.                                   |
| `burn_mint/`               | `BurnMintTokenPool` — pool owns minter admin; burns on lock, mints on release.                             |
| `lock_release_lockbox/`    | `LockReleaseLockboxTokenPool` — custody delegated to a shared `JettonLockBox` (enables pool upgrades).     |
| `lockbox/`                 | `JettonLockBox` — long-lived per-token custody contract; pools are OPERATORs.                              |

## 3. Core architecture

`TokenPool<T>` is a generic struct parameterized by a per-contract context `T`
(the concrete contract's `Storage`). Concrete pools wire behavior via
`TokenPool_Hooks<T>` (Tolk 1.4 closures), mirroring the EVM
abstract/override pattern. `T` carries the pool's pending-operation state so the
core lib stays storage-agnostic.

```
contract Storage  ──load──▶ TokenPool<Storage>{ data, context: Storage, hooks }
        ▲                          │
        └──── context written ─────┘  (hooks return updated context; contract persists it)
```

### 3.1 Deliberate divergences from EVM (correct for TVM)

1. **Mirrored policy, not synchronous calls.** EVM calls `Router`/`RMN` inline.
   TON cannot return synchronously, so the pool keeps **local mirrors** of
   onRamp/offRamp authorization and RMN cursed-subjects, pushed asynchronously by
   trusted senders (analogous to `OffRamp_UpdateCursedSubjects`). Read on the hot
   path; never queried live. (`TokenPool_MirroredPolicy` in `types.tolk`.)
2. **Per-operation async state machines.** Each cross-chain op is keyed by
   `queryId` in a pending map; the pool replies only after positive confirmation
   (`ReturnExcessesBack` / lockbox callbacks). "Confirmation-before-reply."
3. **Executor coordinates.** The OnRamp/OffRamp deploy a per-send Executor that
   drives the flow and is the pool's `replyTo`. Token delivery + intent are
   combined in a single Jetton transfer `forwardPayload`.

### 3.2 Flow summary (as implemented)

**Outbound `lockOrBurn`** (source chain):

```
Executor → (jetton transfer w/ fwdPayload) → Pool wallet
  → TransferNotificationForRecipient → onLockOrBurnTransfer
  → validate (token, chain, curse, access, rate limit, [preflight])
  → onLockOrBurnTransferContinue (pool-specific: burn / deposit-to-lockbox / lock)
  → await burn/deposit confirmation → onLockOrBurnTransferFinalize
  → emit LockedOrBurned + reply TokenPool_LockOrBurnFinished to replyTo
```

**Inbound `releaseOrMint`** (dest chain):

```
Executor → TokenPool_ReleaseOrMint → onReleaseOrMint
  → validate (token, chain, curse, access, remotePool, decimals, rate limit, [postflight])
  → onReleaseOrMintContinue (pool-specific: mint / transfer-from-wallet / lockbox withdraw)
  → await ReturnExcessesBack from recipient wallet → finalize
  → emit ReleasedOrMinted + reply TokenPool_ReleaseOrMintFinished to replyTo
```

### 3.3 Outbound entry path is mid-scaffold (blocks TON-TP/1)

The intended outbound design (documented in `router/contract.tolk:662-669`) is
**validate-first-then-withdraw**:

```
OnRamp/Router → TokenPool_LockOrBurn(intent) → Pool
  Pool validates (gas, rate limit, preflight) WITHOUT moving funds
  Pool → TokenPool_LockOrBurnWithdraw → Executor (verifies amounts)
  Executor → OnRamp (verifies Executor) → Router (holds tokens)
  Router JettonWallet → jetton transfer → Pool wallet
  Pool wallet → TransferNotificationForRecipient(forwardPayload) → Pool
  Pool processes (burn/lock) → TokenPool_LockOrBurnFinished → Executor
```

Rationale: do all fail-able checks before custody moves, so funds never need to be
returned mid-flow. The pool lib scaffolds this
(`onLockOrBurn → validateLockOrBurn → onLockOrBurnWithdraw` emits
`TokenPool_LockOrBurnWithdraw` to `replyTo`), **but the ramp side is mock and not
wired end-to-end:**

- `router/contract.tolk:671-681` sends `MockTokenPool_LockOrBurn` (test opcode
  `0x7dd8f942`), not the real `TokenPool_LockOrBurn`.
- `ccipsend_executor/contract.tolk:215` only handles `TokenPool_LockOrBurnFinished`;
  it does **not** handle the pool's `TokenPool_LockOrBurnWithdraw`. The
  pool→executor→onramp→router→(tokens)→pool-wallet loop is open.

**Consequence:** caller authentication (TON-TP/1) cannot be finalized until this
integration is defined and built — "who may send `TokenPool_LockOrBurn`" (Router?
OnRamp?) and "what is `replyTo`" (the Executor, verified by address derivation) are
ramp-side contract decisions. The inbound jetton-notification auth (TON-TP/2) is
independently well-defined and can proceed now.

### 3.4 Per-pool state machines

| Pool                   | Pending state (keyed by queryId)  | Lock/Burn                                                                | Release/Mint                                                             | Bounce handling                                                        |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **LockRelease**        | `pendingReleases`                 | n/a (tokens land in pool wallet)                                         | `AskToTransfer` from pool wallet → recipient; await `ReturnExcessesBack` | release-path `AskToTransfer` bounce → `ReleaseOrMintFailure` (partial) |
| **BurnMint**           | `pendingBurns`, `pendingMints`    | `AskToBurn` → wallet → master; await `ReturnExcessesBack`                | `MintNewJettons` → master → recipient wallet; await `ReturnExcessesBack` | **none** (empty handler)                                               |
| **LockReleaseLockbox** | `pendingLocks`, `pendingReleases` | transfer to lockbox wallet w/ `JettonLockBox_Deposit`; await `Deposited` | `JettonLockBox_Withdraw` → lockbox; await `ReturnExcessesBack`           | lock-path bounce (partial; wrong dest)                                 |
| **JettonLockBox**      | —                                 | `deposit` via transfer notification (OPERATOR)                           | `withdraw` → `AskToTransfer` (RichBounce)                                | withdraw bounce → `WithdrawFailed` (test TODO)                         |

## 4. EVM parity status

| Capability                                           | EVM               | TON        | Notes                                   |
| ---------------------------------------------------- | ----------------- | ---------- | --------------------------------------- |
| Admin config (chains, ramps, RL, fees, RMN, dynamic) | ✅                | ✅         | See `TON-TP/9` (excess reply)           |
| Decimals conversion + overflow guards                | ✅                | ✅         | Faithful port; untested (`TON-TP/test`) |
| Rate limiter token bucket                            | ✅                | ✅         | See `TON-TP/12,15`                      |
| Fast-finality separate buckets                       | ✅                | ✅         | Fallback to default bucket implemented  |
| Router onRamp/offRamp authorization                  | sync              | mirrored   | by design                               |
| RMN curse check                                      | sync              | mirrored   | by design                               |
| Caller/Executor authentication                       | `_onlyOnRamp`     | ⚠️ stub    | **`TON-TP/1,2`**                        |
| Preflight / postflight (AdvancedPoolHooks)           | ✅                | ⚠️ stub    | **`TON-TP/6`**                          |
| Finality codec (full bytes4)                         | ✅                | partial    | `TON-TP/16`; M1 hardcodes default       |
| Bounce / failure recovery                            | n/a (sync revert) | ⚠️ partial | **`TON-TP/4`**                          |
| Sharded custody of pending ops (ContextExecutor)     | n/a               | ❌         | `TON-TP/7`                              |

## 5. Issue register

Severity: 🔴 fund-safety/correctness · 🟠 protocol completeness · 🟡 parity/polish · 🧪 tests.

### 🔴 Critical

- **TON-TP/1 — Executor/caller authentication incomplete (blocked on §3.3).**
  `onLockOrBurn` sets `transferInitiator = sender` with `// TODO: fixme`
  (`token_pool.tolk:767-768`). The design's Executor-by-address-derivation trust
  (verify caller == `autoDeployAddress(execId).calculateAddress()`, the same pattern
  as `onramp/contract.tolk:78`) is not implemented. Pool currently trusts the
  message sender. **Entangled with the mock/unbuilt outbound integration (§3.3):**
  the authorized sender of `TokenPool_LockOrBurn` and the `replyTo` Executor are
  ramp-side contract decisions that must be settled first.
- **TON-TP/2 — Inbound jetton transfer not authenticated.** _(Partially fixed.)_
  ✅ **Done:** single-verification-point lives in the **base lib** —
  `onLockOrBurnTransfer` asserts the notification sender is this pool's own Jetton
  wallet, derived from the pool's Jetton identity. The Jetton identity
  (`JettonClient` = master + wallet code) is now the single source of truth nested in
  `TokenPool_AdminConfig` (the standalone per-pool `jettonClient` storage field and
  the redundant `token` field were removed); `TokenPool_Data.jettonClient()` /
  `.token()` expose it. No per-pool duplication. Closes the spoofed-wallet /
  fake-deposit vector. Verified: 110/110 pool + lockbox tests green.
  ⏳ **Remaining (coupled to §3.3 + TON-TP/18):** strict `transferInitiator == Router`
  enforcement and the reject-vs-return semantics for non-Router (deposit-account)
  initiators (`token_pool.tolk:838`). Deferred until the outbound integration defines
  who delivers tokens and the deposit-account path is designed.
- **TON-TP/3 — `amount == jettonAmount` check disabled in core.**
  `token_pool.tolk:831-832` comments out the assertion ("can we trust JettonWallet
  forward payloads?"). Concrete pools assert forwarded vs transferred amount; the
  core path does not.
- **TON-TP/4 — Bounce handling incomplete / unsafe.**
  `burn_mint/contract.tolk:62-65` `onBouncedMessage` is empty. Lockbox lock-bounce
  replies to `createAddressNone()` and performs no token return
  (`lock_release_lockbox/contract.tolk:197,202`). `TokenPool<T>.onBouncedMessage`
  library handler is unimplemented (`token_pool.tolk:586`).
  **Finding (from TON-TP/5):** the `RichBounce` mode used by burn_mint/lockbox to
  "recover the forwardPayload" misaligns `skipBouncedPrefix()` (which expects the
  standard `0xFFFFFFFF` prefix), so the union `fromSlice` throws TVM exit 63 and the
  handler reverts. lock_release was fixed by using a standard bounce + reading only
  op+queryId (its context is in storage). burn_mint/lockbox need the same treatment, or
  a correct RichBounce decoder if the forwardPayload truly must be recovered from the
  bounce. Consumed rate-limit + pending entries must be unwound in every fixed handler
  (see TON-TP/5 refund helpers).
- **TON-TP/5 — Rate limit consumed before async success.** _(Inbound release path fixed.)_
  Rate limit is consumed at admission (correct for gating — the check must precede the
  irreversible transfer; "consume on confirmation" can't reject). The gap was no refund
  on failure. ✅ **Done:** added `RateLimiter_TokenBucket._refund` +
  `TokenPool.releaseInbound/OutboundRateLimit`; `lock_release` `onReleaseTransferBounced`
  now refunds the consumed inbound capacity. Also fixed that handler to use a **standard
  bounce** (RichBounce misaligned `skipBouncedPrefix` → the handler reverted with TVM
  exit 63, so it never worked). Added `getCurrentInboundRateLimiterTokens` getter and a
  test verifying refund-on-bounce. ⏳ **Remaining:** outbound + fast-finality refunds, and
  the same refund in burn_mint/lockbox failure paths — land with TON-TP/4 (their bounce
  handlers) and FTF (M4). The async-preflight `wait` path (TON-TP/6) is dead in M1.

### 🟠 High

- **TON-TP/6 — Preflight/postflight async flow unimplemented.**
  `TokenPool_PreflightCheckFinished/Failed`, `PostflightCheckFinished/Failed`
  handlers are stubs (`token_pool.tolk:514-535`); the AdvancedPoolHooks
  message-send is TODO (`token_pool.tolk:1100,1120`). `preflightCheck`/
  `postflightCheck` return `wait=true` when hooks are set, but nothing resumes the
  suspended operation.
- **TON-TP/7 — ContextExecutor / sharded storage not implemented.**
  Pending-op maps live in contract storage (`burn_mint/storage.tolk`,
  `lock_release/storage.tolk` — see their TODOs) → unbounded growth / dict limits.
  `sendExcessesTo` is hardcoded to `self` across pools; design routes it through a
  per-message ContextExecutor.
- **TON-TP/8 — msg.value validation missing across flows.**
  "Check message value is enough to cover full flow" is TODO in
  `token_pool.tolk:823`, lockbox, and the concrete pools. Underfunded ops can strand
  pending state or drain the contract on best-effort returns.
- ✅ (**Done**) **TON-TP/9 — Admin ops don't reply / return excess.**
  `applyChainUpdates` and `applyRampAccessUpdates` have `// TODO: reply back to
sender with excess` (`token_pool.tolk:422,462`); other admin ops reply. Inconsistent
  and leaks gas.
- **TON-TP/10 — No always-reply (ack/nack) guarantee.**
  Flows reply only when `replyTo != null` (`lock_release/contract.tolk:179`,
  `token_pool.tolk:901`). The Executor state machine needs a deterministic
  success/failure response for every op to avoid stalls.

### 🟡 Medium

- ✅ (**Done**) **TON-TP/11 — Rate-limit-consumed events not emitted** (`token_pool.tolk:1162,
1178,1204,1230`); fee-config updated/deleted events defined but unused
  (`events.tolk`).
- **TON-TP/12 — `setRateLimitConfig` bypasses `_setTokenBucketConfig`.** Rebuilds
  via `fromConfig` (`token_pool.tolk:1274-1283`), skipping `Config.validate()`.
- **TON-TP/13 — `setDynamicConfig` missing router zero-address check**
  (`token_pool.tolk:216-217`).
- **TON-TP/14 — Event `sender` field set to contract addr** vs EVM `msg.sender`
  (`burn_mint/contract.tolk:199`, `lock_release/contract.tolk:145`).
- **TON-TP/15 — `rate_limiter._consume` throws instead of surfacing
  `minWaitInSeconds`** (`rate_limiter.tolk:79`); `BucketOverfilled` path differs
  from EVM semantics.
- **TON-TP/16 — FinalityCodec partial.** Only default + single-fast equality check
  (`token_pool.tolk:1323-1328`); full bytes4 flags/block-depth codec deferred.
  Acceptable for M1 (hardcoded default finality).
- **TON-TP/17 — JettonLockBox gaps.** Events unwired (`lockbox/JettonLockBox.tolk:23`),
  operator init commented out (`:102-106`), deposit fwdp/amount assertions and value
  checks missing (`:145,153,158`).
- **TON-TP/18 — Deposit-account inbound path (Path 3) unsupported**
  (`token_pool.tolk:843-847`).
- **TON-TP/19 — Cleanups.** `errors.tolk` has unfinished `// TODO: extra` enum
  entries; `getFeeAmount` duplicates `getFee` fee logic and is flagged "register as
  available hook" (`token_pool.tolk:672`); `token_pool_contract.tolk:16` "all
  incoming messages should be registered".

### 🧪 Tests

- **TON-TP/T1** — No rate-limit tests (config + blocking behavior).
- **TON-TP/T2** — No decimals-conversion tests (cross-decimal normalization, overflow).
- **TON-TP/T3** — No preflight/postflight tests.
- **TON-TP/T4** — Lockbox bounce test is a TODO (`JettonLockBox.spec.ts`); burn_mint
  bounce path untested.
- **TON-TP/T5 — `JettonLockBox.spec.ts` fixed (was 21 failing).** ✅ Resolved. Root
  causes (all test-side, contract untouched): (1) filename-casing collision — gen
  wrapper was `JettonLockbox.ts` but imports/CI use `JettonLockBox`; renamed.
  (2) one-step deploy+init in `beforeEach`/two tests — the init reserves rent then
  replies `CARRY_ALL_REMAINING`, which fails the action phase unless the contract is
  pre-funded; switched to the production deploy-then-init flow. (3) stale `ErrorCodes`
  constants (`272xx`) — corrected to the actual facility codes (`624xx`). All 21 green.

## 6. Current focus

**Critical fund-safety cluster: TON-TP/1–5** (pool-local first; TON-TP/1 deferred
per §3.3). Progress: **TON-TP/2** (single-verification-point) and **TON-TP/5**
(rate-limit refund on the inbound release bounce) landed & verified; 114/114 pool +
lockbox tests green. Remaining: **TON-TP/4** (complete + harden bounce handling across
burn_mint/lockbox — see the RichBounce finding — and unwind state/rate-limit on every
path) and **TON-TP/3** (amount check, coupled to §3.3). The auth model, failure
recovery, and accounting integrity must be correct before higher-level flows are
hardened.
