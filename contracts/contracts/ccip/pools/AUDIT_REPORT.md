# CCIP Token Pools 2.0 — TON Port Security Review

**Scope:** `chainlink-ton/contracts/contracts/ccip/pools` (TON / Tolk 1.4.1, CCIP protocol 1.6)
**Reference:** `chainlink-ccip/chains/evm/contracts/pools` (EVM Token Pool 2.0)
**Reviewer role:** Pre-audit internal security review (in preparation for third-party audit + launch)
**Date:** 2026-08-31
**Test baseline:** `tests/ccip/pools/` — 182/182 passing (after the fixes below).

---

## 1. Architecture summary

The TON port re-implements the EVM `TokenPool` abstract base as a generic Tolk library
(`lib/token_pool/entrypoint.tolk`, ~2400 LoC) parameterized over a per-pool context `T`, plus a
hooks struct (`TokenPool_Hooks<T>`) that concrete pools wire to customize the lock/burn and
release/mint flows. Two concrete pools are shipped:

| TON contract                                      | EVM analogue                            | Custody model                                         |
| ------------------------------------------------- | --------------------------------------- | ----------------------------------------------------- |
| `burn_mint/`                                      | `BurnMintTokenPool`                     | Burns via CCT `AskToBurn`, mints via `MintNewJettons` |
| `lock_release_lockbox/` + `lockbox/JettonLockBox` | `LockReleaseTokenPool` + `ERC20LockBox` | Liquidity escrowed in shared `JettonLockBox`          |

> A standalone `lock_release/` pool (liquidity in the pool's own jetton wallet, `accruedFees`
> ledger) existed on earlier revisions but has been removed: it duplicated the lock/release
> semantics with a more limited custody model. `LockReleaseLockboxTokenPool` is the only
> lock/release variant and is the one that matches EVM's `LockReleaseTokenPool`.

The most important structural divergence from EVM is that **all flows are asynchronous**: a single
EVM `lockOrBurn`/`releaseOrMint` call becomes a multi-message saga (Router → pool → jetton wallet /
minter / lockbox / per-user deposit account → notification → pool finalize). Two consequences drive
most of the findings:

1. **Rate limit is consumed at admission and must be explicitly _refunded_ on every failure branch**
   (a mechanism that does not exist in the atomic EVM contract — `refund()` in `lib/rate_limiter.tolk`
   and the `refund*RateLimit` helpers in `entrypoint.tolk`).
2. **Ramp authentication is delegated entirely to the Router.** EVM checks the caller is the
   per-lane on/off-ramp (`_onlyOnRamp`/`_onlyOffRamp`, `TokenPool.sol:917-936`). TON replaces this with a
   single `onlyRouter(sender)` boundary (`entrypoint.tolk:1941-1944`); the pool trusts the Router to
   have authenticated the ramp.

---

## 2. Findings

Severity reflects impact on a launched, owner-configured deployment.

### HIGH

#### H-1 — `JettonLockBox.onInit` has no deployer/ownership check (deposit-drain via front-run)

**File:** `lockbox/JettonLockBox.tolk:84-128` (self-documented `@bug` at :82-83)

`onInit` is callable by anyone; it is guarded only by `assert(!st.isInitialized())`. The **first**
caller to reach an uninitialized lockbox sets `minterAddress`/`walletAddress` and is granted
`DEFAULT_ADMIN_ROLE` (`:97-101`). `DEFAULT_ADMIN_ROLE` administers `OPERATOR_ROLE`, and `OPERATOR_ROLE`
is the only gate on `onWithdraw` (`:192-193`). An attacker who initializes the lockbox first can grant
themselves `OPERATOR_ROLE` and **withdraw the entire escrowed balance** to any wallet.

The in-code mitigation ("the pool sends Init during deployment with stateInit, so only the deployer
can reach it") is a deployment-timing assumption, not an on-chain invariant. On TON, contract
addresses are deterministic and derivable before deployment; if the `Init` message is not delivered
in the **same** external/deploy transaction as the stateInit, the window is real.

**Recommendation:** Bind the authorized initializer into the contract's initial data (e.g. an
`expectedAdmin`/`deployer` field checked in `onInit`), or require the init message to be signed by /
sent from that address. Do not rely on address unguessability. This is the single most important item
to close before mainnet, and should be explicitly called out to the third-party auditor.

_Only affects the `lock_release_lockbox` variant. `burn_mint` and `lock_release` do not use the lockbox._

---

### MEDIUM

#### M-1 — `setDynamicConfig` silently wiped `allowedDepositNamespaces` ✅ FIXED

**File:** `lib/token_pool/entrypoint.tolk:347-364`

`allowedDepositNamespaces` lives inside `TokenPool_DynamicConfig` (`types.tolk:33`) but is managed by a
separate setter (`setAllowedDepositNamespaces`). `setDynamicConfig` rebuilt the struct literal from
scratch (`{ router, rateLimitAdmin, feeAdmin }`), so the `allowedDepositNamespaces` map defaulted back
to empty. **Any router/feeAdmin/rateLimitAdmin update would silently disable per-user deposit-account
authentication** (`assertAuthorizedDepositInitiator`, `:1519-1548`), breaking deposits routed through
OnRampAccounts until re-configured. Fail-closed (no fund loss) but an operational foot-gun and a
latent availability bug for in-flight flows.

**Fix applied:** load the existing `dynamicConfig`, mutate only the three fields, preserve
`allowedDepositNamespaces`.

#### M-2 — Rate-limiter configs were never validated (divergence from EVM) ✅ FIXED

**File:** `lib/rate_limiter.tolk:30-38`; call sites `entrypoint.tolk:597-602` (`applyChainUpdates`) and
`:2285-2292` (`setRateLimitConfig`)

EVM funnels every rate-limit config through `RateLimiter._setTokenBucketConfig`, which enforces
`rate <= capacity` when enabled and `rate == 0 && capacity == 0` when disabled
(`RateLimiter.sol`). The TON port built buckets via `RateLimiter_TokenBucket.fromConfig`, which
**skipped validation**; `_setTokenBucketConfig` (which does call `validate()`) is marked "TBD This is
not used" (`rate_limiter.tolk:124-136`). As a result the owner/rate-limit-admin could store
`rate > capacity` or a disabled bucket with non-zero fields. A `rate > capacity` lane silently DoSes
transfers on that lane (`consume` reverts `TokenMaxCapacityExceeded` for any request > capacity).

**Fix applied:** `fromConfig` now calls `config.validate()` (mirrors EVM). Rejects the same misconfigs
EVM rejects. All 182 tests still pass.

#### M-3 — Async saga can strand consumed rate-limit capacity; refund accounting is bespoke and under-audited

**Files:** `entrypoint.tolk:934-972` (`refund*RateLimit`), plus each concrete pool's `onBouncedMessage`

Because capacity is consumed at admission and only returned via explicit `refund*RateLimit` calls on
specific bounce/callback branches, two classes of risk exist that have no EVM equivalent:

- **Stranded capacity:** if a saga stalls after admission but before finalize/bounce (e.g. an
  intermediate message runs out of gas without bouncing), the consumed capacity is never refunded and
  the lane's throughput is permanently reduced until it refills.
- **Double-refund / missing-refund:** the correctness of the whole system now depends on _every_
  failure permutation refunding _exactly once_. The permutations (preflight/postflight callback
  failures vs. `AskToBurn`/`MintNewJettons`/`AskToTransfer`/`DepositAccount_Init` bounces vs.
  lockbox `WithdrawFailed`) are spread across four contracts.

No concrete double-refund was found in review, but this is the highest-leverage area for the external
audit. **Recommendation:** enumerate the state machine per pool and assert the refund invariant
(consume ⇒ exactly one of {finalize, refund}) per branch; add negative tests that force each bounce.

#### M-4 — Base library ships with an unimplemented bounce handler + several TODO-gated behaviors in the hot path

**File:** `entrypoint.tolk:765-766` ("TODO: implement onBouncedMessage (lib) handler"), and hot-path
TODOs at `:1405-1406`, `:1424`, `:1710`

The base library does not provide a bounce handler; each concrete pool implements its own
`onBouncedMessage`. That is workable, but success-path replies are sent with `bounce: true`
(`TokenPool_LockOrBurnFinished` `:1712`, `ReleaseOrMintFinished` `:1841`) and there is **no handler for
those bodies** in the concrete pools' bounce matchers — a bounced finalize reply falls through to the
catch-all and is dropped. Combined with the "TODO: we should reply in any case" at `:1710`, some
failure modes leave the executor without a terminal signal. Not a fund-loss path, but a liveness gap
worth closing (and worth a note to the auditor that the base `onBouncedMessage` TODO is intentional /
delegated).

---

### LOW / INFORMATIONAL

- **L-1 — `transferInitiator` uses the Router, not the real sender.** `onLockOrBurn` sets
  `transferInitiator = sender` with `// TODO: fixme` (`entrypoint.tolk:1405-1406`). Flows into the
  `LockedOrBurned` event's `sender` field (`:1705`). Event-attribution only — the actual deposit
  auth uses `details.originalSender` (`:1505`), not this value. Fix before launch for correct
  observability.

- **L-2 — Rate-limiter `consume` computes then discards `_minWaitInSeconds`.**
  `rate_limiter.tolk:73-75` — the wait estimate is dead code (TODO to return it in the error). Cosmetic;
  the EVM error carries it. Consider dropping or threading it into the thrown error.

- **L-3 — `advancedPoolHooks` initialized to `createAddressNone() as address` instead of `null`.**
  ✅ **FIXED** (`feat/tp-hardening`): all three `*/storage.tolk` now init `advancedPoolHooks: null`.
  Removes reliance on addr_none→null coercion in the `hooks != null` branch. 185/185 pool tests pass.

- **L-4 — `Ownable2Step.transferOwnership` lacks a zero-address guard.**
  `lib/access/ownable_2step.tolk` — a typo'd `addr_none` pending owner can be set (the 2-step accept
  mitigates, since `acceptOwnership` requires the pending owner to act). Low risk; add the guard for
  parity with EVM's `Ownable2Step`.

- **L-5 — Single `onlyRouter` trust boundary replaces per-lane ramp auth.**
  `entrypoint.tolk:1941-1944` vs. EVM `_onlyOnRamp`/`_onlyOffRamp` (`TokenPool.sol:917-936`). Correct
  for the async design, but it means a misconfigured or compromised Router can drive any
  lock/burn/release. Confirm the Router enforces per-lane on/off-ramp authentication and RMN policy,
  and document this trust assumption for the auditor. The pool's independent RMN cursed-subject check
  (`ensureNotCursed`, `:1954-1962`) is a good defense-in-depth and is preserved.

- **L-6 — `JettonLockBox` null-initiator deposits.** ✅ **FIXED** (`feat/tp-hardening`): the
  wrong-error `assert(transferInitiator != null)` crash is replaced with a graceful early-return —
  a null-initiator transfer (bare mint / raw transfer) is accepted as **un-credited vault balance**
  (no `JettonLockBox_Deposited` emitted, no crash). Correct because such a transfer can neither be
  attributed to a pool flow nor returned (no initiator), and the lockbox is an aggregate vault so
  surplus balance only strengthens solvency. The sender==wallet auth now runs _before_ this branch.
  New test: _"accepts a null-initiator transfer as un-credited vault balance without crashing"_.

- **L-7 — `ChainAdded` event omits the rate-limiter configs** that EVM emits. ✅ **FIXED**
  (`feat/tp-hardening`): `TokenPool_ChainAdded` now carries `outboundRateLimiterConfig` +
  `inboundRateLimiterConfig` (`Cell<RateLimiter_Config>`), populated in `applyChainUpdates` — EVM
  `ChainAdded` parity. New test asserts the emitted event carries the lane configs.

- **L-8 — No on-chain assertion that minted/released amount equals `localAmount`.** EVM's OffRamp
  asserts the recipient balance delta equals `destinationAmount`. TON trusts the CCT minter /
  lockbox to move exactly `prepared.localAmount` (`burn_mint/contract.tolk:353`,
  `lock_release/contract.tolk:138`). Consistent with the trust model (minter/lockbox are pool-owned),
  but note it as a residual assumption.

- **L-9 — Stale comments.** `feeAdmin: address?; // TODO this is not being used?`
  (`types.tolk:25`) — it _is_ used by `onlyOwnerOrFeeAdmin` (`entrypoint.tolk:2395-2404`). Remove the
  misleading TODO. Similar stale TODOs at `types.tolk:62`, `errors.tolk:27`.

- **L-10 — `token_pool_contract.tolk` is a binding stub whose every entrypoint throws.** Documented as
  "should not be deployed" (`:23`). Ensure deployment tooling can never select it.

- **L-11 — `rmnProxy` is mutable on TON (immutable on EVM) — `setRMNProxy` now zero-guarded.**
  `lib/token_pool/entrypoint.tolk` (`setRMNProxy`). EVM declares `i_rmnProxy` as an `immutable`
  validated in the constructor (`TokenPool.sol` constructor, `ZeroAddressInvalid`). The TON port made
  it a **mutable** `adminConfig.rmnProxy` settable via the owner-only `TokenPool_SetRMNProxy` message.
  ✅ **FIXED** (`feat/fee-withdraw`): `setRMNProxy` now asserts `!isZeroAddress(rmnProxy)` with
  `TokenPool_Error.ZeroAddressInvalid`, since the zero-address guard had to move from constructor to
  setter. **Double-check in a follow-up:** every read of `rmnProxy` (`_onlyOwnerOrRMNProxy`,
  `ensureNotCursed`) now depends on the setter, so confirm no other code path can (re)write
  `adminConfig.rmnProxy` bypassing `setRMNProxy`, and that the deploy script always seeds a non-zero
  value (see L-12).

- **L-12 — `Storage.init` performs no zero-address validation on `router` / `rmnProxy` / token
  (`jettonClient.masterAddress`)** (deploy-time parity gap). All three concrete pools
  (`burn_mint`, `lock_release`, `lock_release_lockbox` `*/storage.tolk`) copy `config.router`,
  `config.rmnProxy`, and `config.jettonClient` straight into storage with no checks. EVM's
  `TokenPool` constructor enforces all three non-zero (`TokenPool.sol` constructor). Risk is bounded
  because the config originates from off-chain deployment scripts rather than arbitrary callers, so
  this is a **deployment-safety parity** item, not a runtime-attacker vector. **Recommendation:** add
  `assert(!isZeroAddress(config.router))` / `!isZeroAddress(config.rmnProxy)` /
  `!isZeroAddress(config.jettonClient.masterAddress)` to each `Storage.init`, or enforce in the deploy
  scripts; tracked in the zero-address config-validation Jira ticket (out of scope for
  `feat/fee-withdraw`).

---

## 3. Parity check vs. EVM (what's faithfully ported)

Reviewed and found equivalent to the EVM reference:

- **Decimals conversion** (`calculateLocalAmount`/`parseRemoteDecimals`, `entrypoint.tolk:1858-1904`)
  matches `TokenPool.sol:525-576`, including round-down on scale-down and overflow guards. TON's
  `mustPow10` enforces the `exp > 77` guard (`lib/math.tolk`, `MAX_EXP10 = 77`) equivalent to EVM's
  explicit check, and `mustCastToCoin` bounds results to uint120.
- **Fee model** (`getFee`/`getFeeAmount`/`applyTokenTransferFeeConfigUpdates`,
  `:977-1106`) matches `TokenPool.sol:1000-1113`: bps `< 10_000`, `destGasOverhead > 0`, reject
  `isEnabled:false` in updates (use the disable list), fee deducted from amount pre-rate-limit.
- **Deposit amount integrity:** `processLockOrBurnTransfer` asserts
  `details.amount == msg.jettonAmount` (`:1499`) — a caller cannot claim to bridge more than the
  jettons actually delivered to the pool wallet.
- **Remote pool auth on release:** `isRemotePool` check (`:1746`) mirrors
  `TokenPool.sol:483` (mint only from configured source pools).
- **RateLimiter refill math** (`_calculateRefill`, `_applyElapsedRefill`) matches EVM including the
  `tokens > capacity` overfilled guard and `min(capacity, …)` cap.
- **`JettonWithdrawable`** fee withdrawal enforces per-transfer `maxAmount` cap and non-zero
  recipient; `lock_release` bounds it by the `accruedFees` ledger (`lock_release/contract.tolk:377-395`),
  correctly re-credited on bounce (`:187-205`) — a good analogue to EVM's "contract balance is fees"
  invariant.

**Intentional divergences (not defects):** TON ships one CCT-based burn/mint pool rather than EVM's
four burn variants (`BurnFrom`/`BurnToAddress`/`BurnWithFrom`); the CCT minter model subsumes them.
Siloed / USDC-CCTP / Lombard pools are out of scope for this port.

---

## 4. Fixes applied in this pass

| ID  | File                                     | Change                                                                    | Verified           |
| --- | ---------------------------------------- | ------------------------------------------------------------------------- | ------------------ |
| M-1 | `lib/token_pool/entrypoint.tolk:347-368` | `setDynamicConfig` preserves `allowedDepositNamespaces`                   | 182/182 tests pass |
| M-2 | `lib/rate_limiter.tolk:30-41`            | `fromConfig` now calls `config.validate()` (rate≤capacity; disabled⇒zero) | 182/182 tests pass |

Both changes are localized, mirror the EVM reference exactly, and were validated against the full
`tests/ccip/pools/` suite (`blueprint build --all` then jest).

## 4b. Input-value (gas) validation findings — V1–V6

Full analysis + proposed model in **`ANALYSIS_INPUT_VALUE_VALIDATION.md`**. Summary:

- **🟠 V1** — No pool entrypoint (`onLockOrBurn`, `onReleaseOrMint`, `onLockOrBurnTransfer`) asserts a
  minimum incoming `msgValue`; ramps gate every entrypoint, pools gate none → OOG / unfundable-failure
  / pool self-subsidy risk.
- **🟠 V2** — The custody-bearing `onLockOrBurnTransfer` is funded by the executor's hardcoded
  `forwardTonAmount = ton("0.01")`, which is below the LockOrBurn failure floor (`returnTransfer`
  `ton("0.1")` + notify). A failed lock either drops the return (`IGNORE_ERRORS`) or subsidises it from
  pool balance. Highest-value concrete fix.
- **🟡 V3** — Lockbox `onWithdraw` has no value check (`JettonLockBox.tolk:147` TODO); underfunded
  withdraw may not fund the `WithdrawFailed` bounce reply.
- **🟡 V4** — Fixed `value:` sends (`BURN_VALUE`, `MINT_VALUE`, `OFF_RAMP_ACCOUNT_DEPLOY_VALUE`,
  `RETURN_TRANSFER_VALUE`, `forwardTonAmount`) with `PAY_FEES_SEPARATELY` draw from pool balance on
  shortfall (silent rent-drain vector).
- **🟡 V5 / 🔵 V6** — All pool value constants are static `ton("…")`; they drift with gas-price
  governance changes and don't scale with payload size (snake lists, CCV sets, variable pool data).
  CCT already has a dynamic estimator (`checkAmountIsEnoughToTransfer`) to model on.

Proposed model: a fail-safe-floor invariant (never advance a flow you can't fail out of) + a
`TokenPool_Costs` library (static first, dynamic via `calculateGasFee`/`fwdFee` later), with entry
floors on the two Router entrypoints and failure-floor propagation into `forwardTonAmount`. See the
analysis doc for the phased plan.

## 5. Recommended before third-party audit / launch

1. **Close H-1** (lockbox init auth) — required.
2. **Formalize M-3** — write out each pool's async state machine and prove the
   consume⇒exactly-one-terminal invariant, with forced-bounce negative tests.
3. Close M-4 liveness gap (terminal reply on all failure paths; base `onBouncedMessage`).
4. Resolve the hot-path `// TODO: fixme` items (L-1) and the `@bug`/`@warning` tags in the lockbox.
5. Document the Router trust assumption (L-5) for the auditor.
6. **Input-value validation (V1–V6)** — land Phase 1–2 from `ANALYSIS_INPUT_VALUE_VALIDATION.md`
   (entry floors + failure-floor `forwardTonAmount`) before launch; Phase 4 (dynamic estimator) for
   durability.

---

### Hardening status (`feat/tp-hardening`)

Fixed & tested this branch: **M-1, M-2** (round 1) · **G1** (round 2, base lock-transfer RL refund) ·
**A1 + G2** (round 3, shared `onBouncedMessage` + `LockOrBurnWithdraw` recovery) · **L-3, L-6, L-7**
(this pass). Pool suite: **185/185**. New tests: `LockOrBurnWithdraw` bounce recovery, null-initiator
lockbox deposit, `ChainAdded` rate-limiter config emission. Value-validation (V1–V6) is analysed and
proposed, not yet implemented.

---

## 6. CCV & fees (`getCCVs` / `getFees`) — EVM parity review and wire change (`feat/tp-get-ccvs-fees`)

Scope: `TokenPool_GetCCVs` / `GetCCVsAndFees` request path, hooks hop, fee computation, and the
`requiredCCVs` reply wire format, reviewed against EVM `pools/TokenPool.sol`
(`getRequiredCCVs`, `getFee`, `_parseRemoteDecimals`, `_calculateLocalAmount`,
`applyTokenTransferFeeConfigUpdates`).

### Wire format: `SnakedCell<address>` → `array<address>`

`requiredCCVs` in `TokenPool_CCVs`, `TokenPool_CCVsAndFees` and `TokenPool_QueryCCVsReply` is now a
Tolk `array<address>` (TVM tuple). Practical consequences:

- **Cap is 255, not 256** — TVM tuples hold at most 255 elements; the 8-bit inline length prefix
  matches exactly. Far beyond any realistic CCV set size.
- **Trivially constructible on-chain**: an empty set serialises as `## 0` + a null `maybeRef`
  (no chunk cells at all); a single CCV is one small chunk cell. No snake-chain building needed
  in caller contracts or hooks.
- **Opcodes unchanged** (GetCCVs `0xc5476d2b`, GetCCVsAndFees `0xd22944d5`, CCVs `0x6c70b2dd`,
  CCVsAndFees `0x158dd7d5`, GetCCVsFailed `0x0449d467`, QueryCCVsReply `0x30612b17`).
- Go binding: `pkgtlbe.Array[common.AddressWrap]` (`pkg/ton/tlbe`, tag `tlb:"."`) — byte-identical
  to the generated TS `storeArrayOf`/`loadArrayOf` and the on-chain parser (chunk packing density is
  parser-agnostic).

### Parity findings (all resolved on this branch)

1. **Bounce exit-code propagation** — `onGetCCVsBounced` forwards the raw TVM exit code unmodified.
   `GetCCVsFailed.errorCode` is a signed `int32` (not `uint16`): TVM exit codes are signed and real
   failures can be negative — out-of-gas surfaces as **-14** (`~13`, negated precisely so user
   contracts cannot fake it; see [TVM exit codes](https://docs.ton.org/tvm/exit-codes)). A `uint16`
   field would have silently rewritten `-14` to something else, misclassifying OOG. Mirrors the
   existing `ReleaseOrMintBounced.exitCode: int32` wire pattern in the ReceiveExecutor.
2. **Validate-first ordering** — `onGetCCVsAndFees` runs `validateGetCCVsRequest` _before_ fee
   computation, matching `onGetCCVs`; no fee work for requests that will revert (EVM ordering parity
   for the reject case).
3. **Zero-config on the disabled fee path** — `getFeeParamsAndPostFeeAmount` returns a fully zeroed
   `TokenPool_TokenTransferFeeConfig` + `feesProvided=false` for absent _or_ disabled configs —
   exact EVM `getFee` `(0,0,0,0,false)` parity. (A stored-but-disabled entry is unreachable anyway:
   updates reject `isEnabled=false` and disable deletes.)
4. **Validation strictness (intentional deviation)** — EVM `getRequiredCCVs`/`getFee` are pure views
   that validate only the finality flag; TON rejects (bounces) unsupported token / chain as well, in
   both entrypoints. An off-chain caller must configure the lane before querying. Documented for the
   OnRamp port.
5. **Empty-set convention** — EVM signals "use lane defaults" with an empty list / `[address(0)]`
   merge semantics in the OnRamp; TON replies with an empty `array<address>`. The TON OnRamp must
   treat _empty_ (not zero-address entries) as include-defaults.
6. **Hooks-hop-only `replyTo`** — `TokenPool_GetCCVs.replyTo` is only honoured on the pool→hooks
   hop; the external reply always goes to `msg.sender` with `forwardPayload` echoed. No
   `queryId`↔pending-request binding on `QueryCCVsReply` — accepted: the pool is stateless, hooks
   are trusted, and the echoed context proves liveness.
7. **Outbound/inbound CCV amount** — outbound subtracts the enabled bps fee before asking hooks;
   inbound converts via `parseRemoteDecimals` + `calculateLocalAmount` with the EVM >77 exponent and
   `uint256` overflow guards (`mustPow10`/`safePow10`). Byte-for-byte parity with
   `_getFee`/`_calculateLocalAmount`.

Go `GetCCVAmount` readers re-exported on BurnMint + LockReleaseLockbox. The custom `tlbe.Array`
codec is covered by `pkg/ton/tlbe/array_test.go`; message structs rely on the third-party `tlb`
tag codec and carry no bespoke round-trip tests. Build 49/49, pool suites **186/186**, Go tests green.
