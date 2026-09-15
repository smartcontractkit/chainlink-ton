# Token Pool — Error Handling, Bounce Handling & Safe Asset Return Audit

**Status:** Analysis + Phase 1 fixes applied + audit re-reviewed.
**Fixed (Post-analysis PR):**

- **[B5]** `lock_release.deployOffRampAccountWithRelease` now sends `OffRampAccount_Init` with `BounceMode.RichBounce` (was `NoBounce`) so a failed OAA init bounces into `onOffRampAccountInitBounced` and the release is finalized with a failure reply instead of silently stalling.
- **[B1]** `lock_release_lockbox.onLockTransferBounced` now refunds the consumed **outbound** rate limit (`refundLockOrBurnRateLimit`) on a failed lock/deposit, mirroring `burn_mint`, so failed locks do not permanently consume capacity.
- **[D1]** `JettonLockBox.onDepositWithTransferNotification` now returns unidentifiable custody best-effort (`returnFundsBestEffort`) when the forward payload is **missing or malformed**, instead of silently parking tokens (and never emitting `JettonLockBox_Deposited`).
- **[C1]** `burn_mint.onBouncedMessage` (`CCT_AskToBurn` case) now returns the un-burned custody to the original sender (`returnBurnOrLockCustody`) in addition to refunding the outbound rate limit and sending the failure reply.
- **[D2/B2]** `lock_release_lockbox.onWithdrawFailed` now reports a distinguishable `LockBoxWithdrawFailed` error (new error code) instead of `UnsupportedOperation`, so a bounced lockbox release is not conflated with an unsupported-operation error.

**Code-decision note (re ../reuse):**

- `C1`'s `returnBurnOrLockCustody` deliberately does **not** reuse `failLockOrBurnTransfer` / `returnTransfer`.
  - `failLockOrBurnTransfer` requires the original `TransferNotificationForRecipient` (`msg`) for `transferInitiator` + `jettonAmount` — that struct is **not available** at burn-bounce time (we only have the bounced `CCT_AskToBurn` and its `customPayload` = `BurnContext`).
  - It returns custody to `transferInitiator`; the burn path must return to `originalSender` (the CCIP user).
  - `returnBurnOrLockCustody` operates purely on `TokenPool_LockOrBurnForwardPayload` (returning to `originalSender`), which is the correct and only-feasible input.
  - Remaining TODO: the base lib's `returnTransfer` (returns to `transferInitiator`) and burn's `originalSender` return are inconsistent → see [A4]/[B3]. Unify once the source-chain custody-return semantics are agreed.

**Scope:** TP base library (`lib/token_pool`), concrete pools (`burn_mint`, `lock_release`, `lock_release_lockbox`), `lockbox`/`JettonLockBox`, and the OffRampAccount / OnRampAccount accounting contracts they depend on.
**Goal:** Ensure every downstream message that this codebase sends has an explicit failure path that (a) finalizes the CCIP flow with a failure reply, and (b) returns custody of assets to the rightful owner **instead of locking them forever**.

---

## 1. Behavioral contract we are trying to enforce

Every flow below must satisfy three invariant families. These are the acceptance criteria the audit is scored against:

| Family             | Invariant                                                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Finalization**   | Every admitted operation that cannot complete must reach `replyTo` with either a `*Finished` or a `*Failure` message. No operation may _silently stall_ after admission (rate limit consumed, receiver known).                            |
| **Custody return** | Assets already received by the pool (or a surrogate account it controls) must be returned to the **original requester / original sender** on any recoverable failure. No funds may remain locked in pool custody when the CCIP leg fails. |
| **Accounting**     | Rate-limit capacity consumed at admission is refunded on failure (`refund*RateLimit`), matching the `consume*`/`release*` pair. Balance must be reserved so failure notifications can always be funded (`reserve*`).                      |

Three of these families are only half-covered today; the gaps are itemised below.

---

## 2. Flow map and downstream messages

The pool sends these **bouncable** messages downstream. A "bounce" means the message came back as a `bounced` transaction with `in.bouncedBody`.

**Lock / Burn (source chain, `lockOrBurnContinue`):**

1. `TokenPool_LockOrBurnWithdraw` → `replyTo` (executor). **Bounce not handled individually; but `.send` has no `BOUNCE_ON_ACTION_FAIL`, and executor expects the transfer not the message to fail.**
2. `AskToTransfer` → pool's own jetton wallet (deposit → custody, or lock → lockbox). Handled.
3. `CCT_AskToBurn` → chain à (`burn_mint`). Handled.
4. `InternalTransferStep` → recipient wallet (via wallet wallet deploy). **Handled only at the jetton wallet, not by the pool.**
5. Non-bouncable state-confirmation: `JettonLockBox_Deposited`, `CCT_ReturnExcessesBack`, `OffRampAccount_Reply`.

**Release / Mint (destination chain, `releaseOrMintContinue`):**

1. `OffRampAccount_Init` (deploy) → derived OAA address. Handled (rich bounce + `onOffRampAccountInitBounced`).
2. `AskToTransfer` → pool's jetton wallet (`lock_release`) or lockbox (`lock_release_lockbox`). Handled.
3. `JettonLockBox_Withdraw` → lockbox (`lock_release_lockbox`). **The lockbox itself then sends `AskToTransfer`; the pool does NOT get that bounce.**✔ partially (lockbox handles it and emits `WithdrawFailed`).
4. `MintNewJettons` → minter (`burn_mint`). Handled (minter→wallet bounce path).

---

## 3. Inventory of findings

Severity legend: 🔴 **Critical** (funds locked / bug), 🟠 **High** (flow can silently stall or asset custody ambiguous), 🟡 **Medium** (robustness/accounting), 🔵 **Low / cleanup**.

### A. Base library (`lib/token_pool/entrypoint.tolk`)

- **🔴 [A1] `onBouncedMessage` not implemented in the base library.**
  Line ~705 contains only `// TODO: implement onBouncedMessage (lib) handler`. The `TokenPool_LockOrBurnFinished` and `TokenPool_ReleaseOrMintFinished` replies are sent with `bounce: true` but there is **no** shared bounce handler for a failed _finished_ reply, nor a general hook contract. Concrete pools each hand-roll their own `onBouncedMessage`, so behavior diverges between pools and shared logic (rate-limit refund) is duplicated.
  **Fix direction:** introduce a base `onBouncedMessage` that decodes the common reply messages and dispatches to shared `recoverPendingOperation` helpers, with concrete overrides for pool-specific messages (`AskToTransfer`, `OffRampAccount_Init`, `CCT_AskToBurn`).

- **🟠 [A2] `onLockOrBurnTransferFinalize` replies `bounce:true` but there is no path to recover if the _finished_ reply bounces.**
  `finished.send(...)` uses `SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE`. If `replyTo` (executor) is gone, custody is fine (tokens already in pool) — but this is the **happy-path terminal**; the bounce of a _finished_ is harmless (no funds in flight). **Lower priority than the failure-side gaps.** Still should be handled uniformly in the base `onBouncedMessage`.

- **🟠 [A3] Best-effort custody return only covers the "decoded forward payload" failure class.**
  In `onLockOrBurnTransfer` the malformed-payload `catch` calls `returnTransfer`, but `failLockOrBurnTransfer` only fires when the payload decodes. If `assertAuthorizedDepositInitiator` **succeeds** but `assert(details.amount == msg.jettonAmount)` fails, the outer `try/catch` → `failLockOrBurnTransfer` → `returnTransfer` fires. **This is covered structurally — confirm with a test that the _amount-mismatch_ path returns funds.** (`returnTransfer` returns to `transferInitiator`, not necessarily `originalSender` — see [B3].)

- **🟡 [A4] `returnTransfer` returns to `transferInitiator`, but the correct return address is ambiguous.**
  In the per-user deposit path (`assertAuthorizedDepositInitiator`) the custody was initiated from a _derived deposit account_, and `transferInitiator` is that account. Returning to the account is safe (owner can withdraw), **but** the _original requester_ is `originalSender`. The returned asset should eventually reach `originalSender`. Confirm the deposit-account return path is acceptable, or route custody directly to `originalSender`.

- **🟡 [A5] `sendLockOrBurnFailure` / `sendReleaseOrMintFailure` have two near-duplicate implementations.**
  `sendLockOrBurnFailure` (line ~770) and `notifyLockOrBurnFailure` (line ~1300) do nearly the same thing; one reserves balance (`reserveLockOrBurnFailureValue`) and the other does not. The reserved-version is only used on the transfer-failure path. **Unify** so _every_ failure notification reserves the pool balance before sending, preventing a "failed to even send the failure" dead-end when the pool is underfunded.

- **🟡 [A6] `reserveLockOrBurnFailureValue` saturates rather than guaranteeing the reservation.**
  The comment acknowledges "Storage accounting can leave a minimally funded pool with less balance than the forwarded value." This is a deliberate trade-off, but a mid-flight large transfer could leave too little to both return and notify. Consider a **floor** check (bounce-on-fail) so the failure notification is not lost. Document the accepted bound.

- **🔵 [A7] `withdrawFeeTokens` is a `// TODO`** — fee accumulation withdraw path missing from base lib. Not a bounce/finalization issue but related to asset custody.

### B. Lock/Release pool (`lock_release/contract.tolk`) + `lock_release_lockbox/contract.tolk`

> **Note (variant removal):** the standalone no-lockbox `lock_release/` pool has since been
> deleted — `LockReleaseLockboxTokenPool` is now the only lock/release variant. Findings below
> that concern `lock_release/contract.tolk` are retained as historical context; only the
> `lock_release_lockbox/` ones are actionable.

- **🔴 [B1] Lock (deposit) bounce does NOT refund the outbound rate limit.**
  `lock_release` does **not** implement an `onLockOrBurnTransferContinue` override at all (its `loadPool` sets `onLockOrBurnTransferContinue: null`), so it inherits the **default finalize** immediately — no extra hop. **When the _standard_ `AskToTransfer`/return path bounces, the outbound RL is not refunded.** `lock_release_lockbox` implements `onLockTransferBounced`, which **returns jettons + sends failure, but never calls `pool.refundLockOrBurnRateLimit`.** Compare: `burn_mint` refunds on `CCT_AskToBurn` bounce. This is an accounting gap → capacity is permanently consumed on a failed lock.

- **🔴 [B2] `lock_release_lockbox.onWithdrawFailed` sends failure with `TokenPool_Error.UnsupportedOperation` — the real reason is lost.**
  The lockbox emits `JettonLockBox_WithdrawFailed` on any bounced withdraw, but the pool reports `UnsupportedOperation` (not `UnexpectedReleaseBounce` or the actual error). Diagnostics are degraded; the executor can't distinguish real failures. **Surface the actual error code** (propagate from the lockbox bounce).

- **🟠 [B3] `returnTransferLocked` returns jettons to `details.originalSender` but `returnTransfer` returns to `transferInitiator`.**
  Two different "return to" addresses across the two failure helpers. In the lockbox variant the return goes to `originalSender` (correct for CCIP), but the underlying token_pool lib returns to `transferInitiator`. **Inconsistent custody-return semantics** — unify on `originalSender`.

- **🟠 [B4] `onReleaseTransferBounced` (lock_release) refunds RL + sends failure but does NOT re-credit the recipient / return custody when the release failed adversarially.**
  For a _release_, the pool is the destination and the _released_ tokens weren't moved yet, so no pool-held custody is at risk — **but** if the pool `AskToTransfer`s from its own wallet and that bounces, those tokens remain _decrementing_ the pool wallet? (See note below on jetton wallet accounting.) Needs verification.

- **🟡 [B5] `deployOffRampAccountWithRelease` uses `bounce: NoBounce`; the corresponding init bounce handler exists only for `burn_mint`/`lock_release_lockbox` (which use `RichBounce`).**
  `lock_release.deployOffRampAccountWithRelease` (line ~75) uses `BounceMode.NoBounce`, so a failed OAA deploy **never bounces** into `onOffRampAccountInitBounced` → the release **silently stalls with inbound RL consumed**. `lock_release_lockbox` and `burn_mint` correctly used `RichBounce`. **This is a real, reachable bug** — a deploy that runs out of funds in its init is silently swallowed.

### C. Burn/Mint pool (`burn_mint/contract.tolk`)

- **🟡 [C1] `onLockOrBurnTransferContinue` does not reserve `TokenPool_RETURN_TRANSFER_VALUE` before sending `AskToBurn`.**
  If `CCT_AskToBurn` bounces (e.g. wallet balance short), `onBouncedMessage` refunds RL + failure, but the _burn never happened_ so custody should be returned via `returnTransfer`-equivalent. Today the burn path relies on the wallet still holding the tokens; verify the burn-bounce path **returns the un-burned jettons to `originalSender`**, not just the failure reply. (Currently returns to the pool wallet owner — but the deposit succeeded, so custody is in the pool's wallet.)

- **🟡 [C2] `onOffRampAccountInitBounced` refunds inbound RL + failure but the mint did not happen — no asset was created, so no return needed. OK.** (mint path is safe: nothing minted yet).

- **🟡 [C3] `onClaimMinterAdmin` sends with `Only256BitsOfBody`; a failed claim (e.g. already claimed) bounces into `onBouncedMessage`, which only matches `CCT_AskToBurn`/`MintNewJettons`/`OffRampAccount_Init` → a claim-minter bounce throws into `UnexpectedBurnBounce`.**
  Not asset-related, but the generic `onBouncedMessage` should tolerate admin/claim bounces rather than mislabel them.

### D. Lockbox (`lockbox/JettonLockBox.tolk`)

- **🔴 [D1] Deposit path can silently drop assets: `onDepositWithTransferNotification` returns when `loadForwardPayloadAsSlice == null`.**
  The documented `// TODO: do we return funds (best effort) or error?` is unresolved. If a pool sends a deposit notification without a forward payload ref, the jettons **stay in the lockbox but no `JettonLockBox_Deposited` is issued** → pool never finalizes, RL consumed forever, funds parked in lockbox. **Return them best-effort to `transferInitiator`.**

- **🔴 [D2] Withdraw failure path does NOT return custody to the _pool_ — only sents a `WithdrawFailed` notification.**
  On `AskToTransfer` bounce from the lockbox wallet, the tokens return to the lockbox (wallet accounting reversed), and the lockbox sends `JettonLockBox_WithdrawFailed` back to the pool caller. **But the pool's balance reservation / custody expectation is not re-established** — depending on pool logic the release may have already decremented custody. Confirm the caller doesn't double-count. (Mitigated if pool holds its own balance; lockbox holds shared vault.)

- **🟠 [D3] `reserveToncoinsOnBalance` with `RESERVE_MODE_BOUNCE_ON_ACTION_FAIL` in `onInit` and `onWithdraw` path is not uniformly applied.**
  `onWithdraw` sends the `AskToTransfer` with only `SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL` — no explicit reserve, so an underfunded lockbox bounce may not fund the `WithdrawFailed` reply. Add a reserve bound.

- **🔵 [D4] `onInit` has `@bug` about no owner check / front-runnable init** (documented). Out of scope for error handling but relevant to custody.

### E. Accounting contracts

- **🟠 [E1] `OffRampAccount.onWithdraw` and `OnRampAccount.onWithdraw` send `AskToTransfer` with `bounce: RichBounce` but NO `onBouncedMessage`.**
  If the owner's withdraw transfer bounces (e.g. wallet short / recipient contract throws), the bounce goes to the OAA/OnRampAccount. Neither has an `onBouncedMessage` → **assets stay but no notif; the withdraw silently fails and no failure is surfaced to the owner.** No pool custody at risk, but the owner-facing UX and error handling is absent.

- **🔵 [E2] `OffRampAccount`/`OnRampAccount` `else` branch throws `0xFFFF` on unknown incoming — arbitrary messages bounce.** Acceptable (defensive) but worth confirming forwarded notifications never hit this branch.

### F. Jetton wallet / minter (dependency surfaces)

- **🟡 [F1] Jetton wallet `onBouncedMessage` only restores `InternalTransferStep` / `CCT_BurnNotificationForMinter` amounts; the pool's `CCT_ReturnExcessesBack` and `JettonLockBox_Deposited` are non-bouncable.**
  The wallet restores balance on a received-`InternalTransferStep` bounce. But the pool **relies on `CCT_ReturnExcessesBack` / `JettonLockBox_Deposited` to finalize**; these are sent with `sendExcessesTo`. If the wallet deploy bounce fails to restore, pool-side state can diverge.

- **🔵 [F2] `MintNewJettons` minter sends with `Only256BitsOfBody`; a mint-bounce restores `totalSupply` in the minter, but the pool's `onBouncedMessage` (burn_mint) handles `MintNewJettons` — coverage exists. Good.**

---

## 4. Cross-cutting root causes

1. **No shared, pool-generic pending-operation recovery in the base lib.** Each concrete pool re-implements `onBouncedMessage` and rate-limit refund; behavior is inconsistent (e.g. [B5] uses `NoBounce`, others `RichBounce`).
2. **Two distinct "return to" semantics** for custody return: `originalSender` vs `transferInitiator` ([B3], [A4]).
3. **Rate-limit refund is not universally paired with custody return.** Some paths refund RL but don't return assets, others return assets but don't refund RL ([B1], [C1]).
4. **Balance reservation for failure notification is not guaranteed** on all paths ([A6], [D3]).

---

## 5. Priority-ranked action plan

The plan is ordered by fund-safety first, then flow-finalization, then accounting.

### Phase 1 — Critical custodial & finalization fixes

1. **[D1] Lockbox deposit with missing forward payload → return funds best-effort** (issue `JettonLockBox_Deposited` or reverse `AskToTransfer` to `transferInitiator`). Block release of any new lockbox path without this.
2. **[B5] Switch `lock_release.deployOffRampAccountWithRelease` to `RichBounce`** so failed OAA init bounces into `onOffRampAccountInitBounced` (already implemented in the other pools — port it), and add the matching test.
3. **[B1] refund the outbound rate limit on lock/deposit bounce** — add `refundLockOrBurnRateLimit` call in `lock_release_lockbox.onLockTransferBounced` (and any lock_release bounce path once implemented). Add invariants in a shared bounce test.

### Phase 2 — Standardize governance & accounting

4. **[A1]+[A5] introduce a shared base `onBouncedMessage`** in the token pool lib that:
   - decodes common reply messages (`*Finished` / `*Failure`),
   - dispatches pool-context recovery,
   - **always** reserves pool balance before emitting any failure notification (dedupe `sendLockOrBurnFailure` / `notifyLockOrBurnFailure`).
5. **[A4]/[B3] unify custody-return semantics on `originalSender`.** Document why `transferInitiator` is sometimes used and eliminate the mismatch.
6. **[C1] ensure the burn path returns un-burned jettons to `originalSender` on `CCT_AskToBurn` bounce** (not just the failure reply).

### Phase 3 — Robustness, accounting, diagnostics

7. **[B2]/[D2] propagate real error codes** from lockbox `WithdrawFailed` to `ReleaseOrMintFailure` instead of `UnsupportedOperation`.
8. **[D3]/[A6] add explicit balance reservation floors** so failure notification sending can't silently fail on underfunded pools.
9. **[E1] add `onBouncedMessage` to OffRampAccount / OnRampAccount** so owner-facing withdraw failures are surfaced (no pool custody risk, owner+dev UX).
10. **[C3] tolerate admin/minter claim bounces** in `burn_mint.onBouncedMessage`.

### Phase 4 — Test hardening

11. Add a shared spec (`TokenPool.bounce.behavior.ts` or extend `TokenPool.behavior.ts`) covering, per pool:
    - lock/deposit bounce → assets returned + outbound RL refunded + failure reply;
    - OAA deploy bounce → inbound RL refunded + failure reply (no silent stall);
    - release `AskToTransfer` bounce → inbound RL refunded + failure reply;
    - lockbox withdraw-fail → error code propagates + no double-released custody;
    - **no path leaves assets in pool/lockbox custody without a `*Finished` or `*Failure`.**

---

## 6. Open questions for the team (need answers before implementation)

1. **Custody return target:** Should failed-source-chain sends always return to `originalSender` (the CCIP user), or is `transferInitiator` (the deposit account) acceptable and then rely on the account owner to withdraw? This decides the [A4]/[B3] unification.
2. **Lockbox as shared vault:** With the lockbox holding tokens across pools, is pool-held "balance reserve" the right model, or must the lockbox own the reservation on its own wallet? ([D2])
3. **Executor expectations:** When the pool returns custody after a failed lock, does the executor expect a `TokenPool_LockOrBurnFailure` (so it can refund the user on its side) or does the custody return _itself_ count as the finalization? Confirm the OnRamp/executor contract.
4. **OAA deploy failure semantics:** Is "deploy ran out of funds in init" the only failure mode, or can init throw for other reasons (allowedJettonWallet config)? Determine whether `NoBounce`→`RichBounce` for `lock_release` is fully sufficient or whether the init itself needs a try/catch.

---

## 7. Files audited

- `contracts/ccip/pools/lib/token_pool/entrypoint.tolk`
- `contracts/ccip/pools/lib/token_pool/{messages,types,errors}.tolk`
- `contracts/ccip/pools/lib/rate_limiter.tolk`
- `contracts/ccip/pools/burn_mint/contract.tolk`
- `contracts/ccip/pools/lock_release_lockbox/contract.tolk`
  (a no-lockbox `lock_release/contract.tolk` was audited here too, but has since been removed)
- `contracts/ccip/pools/lockbox/JettonLockBox.tolk`
- `contracts/ccip/accounts/off_ramp_account/contract.tolk`
- `contracts/ccip/accounts/on_ramp_account/contract.tolk`
- `contracts/ccip/cct/JettonWallet.tolk`, `JettonMinter.tolk`
- Tests: `tests/ccip/pools/{BurnMintTokenPool,LockReleaseLockboxTokenPool,JettonLockbox}.spec.ts`, `tests/ccip/pools/TokenPool.behavior.ts`

---

# Round 2 — Bounce/error re-audit against current code (2026-08-31)

**Method:** re-traced every asynchronous saga against the _current_ source (the code has since
been refactored: `OffRampAccount_*` → `DepositAccount_*`, `onOffRampAccountInitBounced` →
`onDepositAccountInitBounced`). Verified each downstream `bounce`-able send has a handler, and that
each handler satisfies the three invariant families (Finalization / Custody return / Accounting).
Baseline: `tests/ccip/pools/` = **182 passing** (after the fix below; rebuild with
`blueprint build --all` before running specs — the harness loads prebuilt artifacts).

## Confirmed fixed since round 1 (verified in current code)

| ID    | Where                                             | Status                                                                                                               |
| ----- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| B5    | `lock_release` (variant since removed)            | ✅ `BounceMode.RichBounce` → `onDepositAccountInitBounced` refunds inbound RL + failure reply                        |
| B1    | `lock_release_lockbox.onLockTransferBounced`      | ✅ calls `refundLockOrBurnRateLimit` (`lock_release_lockbox/contract.tolk:322`)                                      |
| B2/D2 | `lock_release_lockbox.onWithdrawFailed`           | ✅ reports `LockBoxWithdrawFailed` (`:381`) not `UnsupportedOperation`                                               |
| C1    | `burn_mint.onBouncedMessage` `CCT_AskToBurn`      | ✅ `returnTransferLocked` + `refundLockOrBurnRateLimit` + failure (`burn_mint/contract.tolk:130-133`)                |
| D1    | `JettonLockBox.onDepositWithTransferNotification` | ✅ best-effort `returnTransfer` on missing/malformed payload (`JettonLockBox.tolk:151-183`)                          |
| E1    | Deposit accounts                                  | ✅ `DepositAccount.onBouncedMessage` handles the owner-withdraw `AskToTransfer` bounce (`accounts/deposit/lib.tolk`) |

## New finding fixed this round

- **🟠 [G1] Base `onLockOrBurnTransfer` failure path did not refund the outbound rate limit.** ✅ FIXED
  In `lib/token_pool/entrypoint.tolk`, when custody arrives (`TransferNotificationForRecipient`) but
  `processLockOrBurnTransfer` throws (amount-mismatch `AmountMismatch`, or unauthorized deposit
  initiator `assertAuthorizedDepositInitiator`), the inner `catch` called `failLockOrBurnTransfer`
  (return custody + notify) but **never refunded the outbound capacity consumed in the earlier
  `onLockOrBurn` admission tx**. This is the base path shared by _all three_ pools (it runs before the
  concrete `onLockOrBurnTransferContinue` hook), so it was an accounting hole every pool inherited.
  **Fix:** the inner catch now calls `self.refundLockOrBurnRateLimit(fwdp)` before finalizing
  (`entrypoint.tolk:1476-1485`). Double-refund-safe: the downstream lock/burn messages are only
  emitted by the continuation hook, which `processLockOrBurnTransfer` reaches solely on success — a
  failure here means no downstream message and therefore no bounce-path refund can also fire.

## Remaining open items (documented, not yet fixed)

- **🟠 [G2] Bounced `TokenPool_LockOrBurnWithdraw` (to the executor) is unhandled.**
  `onLockOrBurnWithdraw` sends it with `bounce: true` to `msg.replyTo` (`entrypoint.tolk:1425-1438`),
  but none of the pools' `*_BouncedMessage` unions decode it (`{AskToTransfer, CCT_AskToBurn,
MintNewJettons, DepositAccount_Init, TokenPool_GetCCVs}`). If the executor is dead / rejects, the
  bounce fails to parse and the outbound RL (consumed at admission) is **stranded with no failure
  reply** — the flow neither completes nor unwinds. No custody is at risk (tokens never left the
  user). Reachable only on executor-infra failure (replyTo is Router-set). **Fix direction:** decode
  the bounced `LockOrBurnWithdraw` in each pool (or a base handler) → `refundLockOrBurnRateLimit` +
  `sendLockOrBurnFailure`. Severity: Medium (stuck capacity + no finalization; no fund loss).

- **🔵 [G3] Bounced `TokenPool_LockOrBurnFinished` / `TokenPool_ReleaseOrMintFinished` are unhandled.**
  Sent with `bounce: true` (`entrypoint.tolk:1712`, `:1841`). If `replyTo` is gone the bounce is
  dropped. Harmless (assets already settled), but the terminal success signal is lost. Handle
  uniformly once a base `onBouncedMessage` exists ([A1]). Severity: Low.

- **🟠 [G4] `burn_mint` mint: a `DepositAccount_ForwardNotification` validation failure occurs _after_
  the mint already succeeded.** The recipient's OAA has been credited (owner = recipient can
  withdraw), but if `onDepositAccountForwardNotification` asserts fail (`:388-419`) the tx reverts, so
  the pool never sends `ReleaseOrMintFinished` and the inbound RL stays consumed. Because the OAA
  address is deterministic in the recipient only (not `queryId`), an executor retry would re-mint to
  the same OAA → **potential double-credit**. Only reachable if the notification validation fails
  (implies a spoofed/foreign sender; the honest path passes). **Fix direction:** make finalize
  idempotent per `queryId`, or assert-and-recover rather than revert-after-mint. Severity: Low–Medium.

- **🟡 [G5] Best-effort custody returns can silently no-op when the pool is underfunded.**
  `returnTransfer` / `returnTransferLocked` / `notifyLockOrBurnFailure` send with
  `SEND_MODE_IGNORE_ERRORS` (`entrypoint.tolk:1615`, `:1666`, `:1692`). If the reserved value is
  insufficient, the action is skipped and custody remains **stuck in the pool jetton wallet** (not
  burned/lost, but not returned either). `reserveLockOrBurnFailureValue` saturates rather than
  guaranteeing the reservation ([A6]). **Fix direction:** enforce a minimum inbound value on the
  lock/deposit entry so the return + notify are always fundable; document the accepted bound.
  Severity: Medium (stuck, governance-recoverable; no permanent loss).

- **🔵 [G6] Malformed-payload branch strands the RL by construction.** The outer `catch` in
  `onLockOrBurnTransfer` (`:1481-1485`) cannot decode the forward payload, so it returns custody but
  cannot identify the operation to refund its RL or notify `replyTo`. Inherent (the payload is the
  pool's own, echoed through executor+wallet, so this only happens under corruption). Severity: Low.

- **🔴/🟠 [A1] Base library still has no shared `onBouncedMessage`** (`entrypoint.tolk:765` TODO).
  Each pool hand-rolls its matcher; [G2]/[G3] are direct consequences. A base handler that decodes the
  common replies and always reserves balance before any failure notify would close G2/G3 and dedupe
  `sendLockOrBurnFailure`/`notifyLockOrBurnFailure` ([A5]). Recommended before audit.

## Fund-safety conclusion (round 2)

No **permanent fund-loss** path was found. Every custody-bearing failure either returns assets or
leaves them in a pool/lockbox wallet recoverable by governance. The residual risks are **stranding**
(RL capacity or a stuck saga) under executor-infra failure or pool underfunding, plus one **double-
credit** edge ([G4]) that requires a validation failure after a successful mint. Priorities for the
external audit: land a base `onBouncedMessage` ([A1]) covering G2/G3, add the value-floor guard (G5),
and add negative bounce tests per pool asserting the _consume ⇒ exactly-one-of {finalize, refund}_
invariant.

## Fixes applied (round 2)

| ID  | File                                       | Change                                                 | Verified                |
| --- | ------------------------------------------ | ------------------------------------------------------ | ----------------------- |
| G1  | `lib/token_pool/entrypoint.tolk:1476-1485` | refund outbound RL on lock-transfer processing failure | 182/182 pool tests pass |

---

# Round 3 — Shared base `onBouncedMessage` ([A1]) + G2/G3 closed (2026-08-31)

Implemented the [A1] cross-cutting fix: a shared bounce handler in the base library so the concrete
pools stop re-implementing the common recovery, and the base-emitted messages (which no pool decoded)
are recovered centrally. Design mirrors the existing `onInternalMessage` delegation for consistency.

## What changed

- **New base handler** `TokenPool<T>.onBouncedMessage(bouncedSender, bouncedBody) -> bool`
  (`lib/token_pool/entrypoint.tolk`). Decodes `TokenPool_BouncedMessage`
  (`lib/token_pool/messages.tolk`) — the set the base library itself emits with a bounceable mode —
  and returns `true` when it recovered one (caller persists `self.data`), else `false` so the pool
  decodes its own pool-specific bounces. Cases:
  - `TokenPool_LockOrBurnWithdraw` → **closes [G2]**: unwinds the outbound rate limit consumed at
    admission and replies `TokenPool_LockOrBurnFailure` (new error `LockOrBurnWithdrawBounced` = 14923) instead of stranding capacity when the executor rejects the withdraw. Required changing
    the withdraw send from `bounce: true` to `BounceMode.RichBounce` so the full forward payload
    survives the bounce (`onLockOrBurnWithdraw`).
  - `TokenPool_GetCCVs` → centralizes the hooks-query-bounce recovery that was copy-pasted in all
    three pools (`onGetCCVsBounced`).
- **New shared recovery helpers** (dedupe the refund+notify pair, ~6 call sites):
  `recoverLockOrBurnFailure(fwd, code)` and `recoverReleaseOrMintFailure(fwd, code)`.
- **Concrete pools** (`burn_mint`, `lock_release`, `lock_release_lockbox`) now call
  `pool.onBouncedMessage(...)` first and drop their duplicated `TokenPool_GetCCVs` bounce case (also
  removed from each `*_BouncedMessage` union). Their `DepositAccount_Init` / release-transfer /
  lock-transfer bounce handlers now use the shared `recover*Failure` helpers.

## Status of prior open items after round 3

- **[G2] Bounced `TokenPool_LockOrBurnWithdraw`** — ✅ **FIXED** (base handler + RichBounce). New test
  in `BurnMintTokenPool.spec.ts` asserts: withdraw sent to a `Bouncer` executor bounces back, the
  outbound rate limit is refunded, and a `LockOrBurnFailure(errorCode=14923)` finalizes the flow.
- **[G3] Bounced `*Finished` replies** — still sent `bounce: true` and not decoded by the base union
  (harmless: assets already settled). Left as-is intentionally; if desired, switch the terminal
  replies to `BounceMode.NoBounce` so no bounce is produced. Low.
- **[A1] Base `onBouncedMessage`** — ✅ **DONE** (shared handler now exists; pools delegate to it).
- **[G4]/[G5]/[G6]** — unchanged (documented in round 2); not in scope for this change.

## Tests

- Rebuilt (`yarn build`), regenerated wrappers (`abigen`), ran `jest`. Only the four pool wrappers I
  touched regenerated (no non-pool wrapper changed). Pool suite: **183/183** (added the G2 recovery
  test). The existing GetCCVs-bounce test (`TokenPool.ccvFees.behavior.ts`, `MOCK_HOOKS_BOUNCE_ID`)
  and every pool-specific bounce test still pass, confirming the delegation preserves behavior.

## Fixes applied (round 3)

| ID  | File                                                                                 | Change                                                                                                    | Verified                                |
| --- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| A1  | `lib/token_pool/{entrypoint,messages,errors}.tolk` + 3 pools                         | shared base `onBouncedMessage` + `recover*Failure` helpers; pools delegate & drop duplicated GetCCVs case | 183/183 pool tests                      |
| G2  | `lib/token_pool/entrypoint.tolk` (`onLockOrBurnWithdraw` → RichBounce; base handler) | recover bounced `LockOrBurnWithdraw`: refund outbound RL + `LockOrBurnFailure`                            | new test in `BurnMintTokenPool.spec.ts` |
