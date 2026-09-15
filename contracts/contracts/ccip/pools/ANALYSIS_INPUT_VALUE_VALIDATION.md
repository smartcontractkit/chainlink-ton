# Token Pool — Input-Value (Gas) Validation: Analysis & Proposal

**Status:** Analysis + proposal (no code changes yet). For review before implementation.
**Author:** pre-audit hardening pass (`feat/tp-hardening`), 2026-08-31.
**Scope:** `contracts/ccip/pools/**` (base lib + burn_mint, lock_release_lockbox, lockbox),
with reference to how `onramp/`, `offramp/`, `fee_quoter/`, and `cct/` validate value today.

---

## 1. Problem statement & threat model

On TON every contract pays for its **own** compute and for the TON `value` it attaches to outbound
messages, funded from the `value` of the **incoming** message (plus, if it over-spends, its own
balance). A CCIP token-pool operation is not one transaction — it is a multi-message saga that
crosses the pool, its jetton wallet, the CCT minter, per-user deposit accounts, and the lockbox.

If any entrypoint or continuation runs with **too little `value`**, one of three bad things happens:

1. **OOG mid-flow** — the compute or action phase aborts partway. If the message was non-bounceable
   (or the failure is in the action phase with `IGNORE_ERRORS`), the flow neither completes nor
   unwinds: **the rate limit stays consumed and, worse, custody can be stranded** (tokens already
   in the pool/lockbox wallet, no finalize, no return).
2. **Unfundable failure** — the flow correctly decides to fail, but the failure/return path itself
   (`returnTransfer` = a jetton transfer, `notifyLockOrBurnFailure` = a reply) costs TON the pool
   no longer has, so the best-effort `IGNORE_ERRORS` send is silently dropped.
3. **Pool self-subsidy** — the pool covers a shortfall from its **own balance**, slowly draining the
   contract until it can't pay storage rent and gets frozen/deleted (taking its jetton-wallet
   custody down with it).

The invariant we want (the user's framing): **on every entrypoint and every flow continuation there
must be at least enough `value` (plus a buffer) to finalize with a failure** — i.e. to unwind the
rate limit, return any custody we hold, and notify the requester — _without touching the pool's own
balance_.

---

## 2. How value flows in a pool saga (primer)

Two representative flows (post-`feat/tp-hardening`):

**LockOrBurn (outbound):**

```
Router --TokenPool_LockOrBurn(value=Vr)--> pool.onLockOrBurn
    consume RL; send TokenPool_LockOrBurnWithdraw (CARRY_ALL) --> executor
executor --jettons + TransferNotification(forwardTonAmount=0.01)--> poolWallet --> pool.onLockOrBurnTransfer   # CUSTODY ARRIVES
    burn:    send CCT_AskToBurn(value=0.05) --> minter --> CCT_ReturnExcessesBack --> finalize
    lockbox: send AskToTransfer(CARRY_ALL) --> lockbox --> JettonLockBox_Deposited --> finalize
    lock:    finalize inline
    FAILURE: returnTransfer(value=0.1) + notifyLockOrBurnFailure(CARRY_ALL_BALANCE|IGNORE_ERRORS)
```

**ReleaseOrMint (inbound):**

```
Router --TokenPool_ReleaseOrMint(value=Vr)--> pool.onReleaseOrMint
    consume RL; deploy DepositAccount_Init(value=0.1 / CARRY_ALL) --> OAA
OAA --DepositAccount_Reply--> pool
    mint:    MintNewJettons(value=0.1) --> minter --> OAA wallet --> ForwardNotification --> finalize
    lockbox: JettonLockBox_Withdraw(CARRY_ALL) --> lockbox --> ... --> ForwardNotification --> finalize
    FAILURE (any bounce): refund RL + sendReleaseOrMintFailure(CARRY_ALL)
```

Key point: the `value` that funds the **custody-bearing** handler (`onLockOrBurnTransfer`) is **not**
`Vr` from the Router — it is the `forwardTonAmount` the executor chose when it sent the jettons
(hardcoded `ton("0.01")`, see §4/V2). The pool does not get to reject at that point (custody has
already arrived), so the safe-fail budget must have been _carried in_ by that `forwardTonAmount`.

---

## 3. Current state

### 3.1 Ramps — static composed cost constants (the pattern to learn from)

Ramps validate value up-front against a **sum of hardcoded per-hop constants**:

- `OnRamp_WithdrawFeeTokens`: `assert(in.valueCoins > OnRamp_Costs.WithdrawFeeTokens())`
  (`onramp/contract.tolk:134`), where `OnRamp_Costs.WithdrawFeeTokens() = ton("0.02")+ton("0.019")+ton("0.05")`
  (`onramp/messages.tolk:210-216`) — compute + fwd + downstream collector compute.
- `OffRamp.onCommit`: `assert(value >= OffRamp_Costs.commit(...))` (`offramp/contract.tolk:516`).
- `OffRamp.onExecuteSingleReport`: **dynamic** — `assert(value >= OffRamp_Costs.execute() + message.gasLimit)`
  (`offramp/contract.tolk:674-676`), with a `MIN_GASLIMIT = ton("0.025")` floor (`:43-44,:405`).
- `FeeQuoter`: `assert(in.valueCoins >= FeeQuoter_Costs.GetValidatedFee())` (`fee_quoter/contract.tolk:81`).

**Shape:** a `X_Costs` module of `fun op(): int { return ton(a) + ton(b) + downstream.op(); }`, asserted
once at the entrypoint. Mostly static; OffRamp adds the caller-supplied `gasLimit`.

**Limitations (the "can we do better?" answer):**

- **Drift:** the `ton("0.02")` literals are hand-tuned to _today's_ gas price and _today's_ message
  shapes. TON gas/forward prices are governance config params (25/21); a price change silently makes
  every static floor wrong (too low → OOG returns; too high → rejects valid traffic).
- **Doesn't scale with payload:** cost is charged per-cell/per-bit forwarded. Snake-cell lists
  (remote pools, CCV sets, `chainsToAdd`) and variable `sourcePoolData`/`extraData` make the real
  forward fee size-dependent, but the constants are fixed.

### 3.2 CCT — dynamic estimation (the better pattern, already in-repo)

`cct/fees-management.tolk:43-60` `checkAmountIsEnoughToTransfer` computes the floor from first
principles at runtime:

```tolk
assert(msgValue >
    forwardTonAmount
    + fwdCount * fwdFee                                   // real per-forward fee (from the message)
    + forwardInitStateOverhead()
    + calculateGasFee(MY_WORKCHAIN, sendTransferGasConsumption)
    + calculateGasFee(MY_WORKCHAIN, receiveTransferGasConsumption)
    + calculateJettonWalletMinStorageFee()
) throw ERROR_NOT_ENOUGH_GAS;
```

It uses `calculateGasFee(workchain, gas)` (converts gas units → TON at the _current_ price),
`getPrecompiledGasConsumption()`, the message's own `fwdFee`, and a storage floor. This is
price- and size-adaptive — exactly the model we want for the pools.

### 3.3 Pools — **no incoming-value validation at all**

- `onLockOrBurn`, `onReleaseOrMint`, and the `TransferNotificationForRecipient` handler
  (`onLockOrBurnTransfer`) take **no** `assert(msgValue >= …)`. `onInternalMessage` threads `msgValue`
  through but never gates on it.
- Every downstream send uses `SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE` (forward whatever's left)
  or a **fixed** `value:` (`BURN_VALUE=0.05`, `MINT_VALUE=0.1`, `OFF_RAMP_ACCOUNT_DEPLOY_VALUE=0.1`,
  `RETURN_TRANSFER_VALUE=0.1`, `forwardTonAmount=0.01`). Fixed sends with `PAY_FEES_SEPARATELY` are
  the dangerous ones: they draw from balance if the incoming value is short.
- Failure/return paths are best-effort: `notifyLockOrBurnFailure` uses
  `SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS`; `returnTransfer`/`returnTransferLocked` use
  `SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS`. `reserveLockOrBurnFailureValue` reserves
  the pool's _pre-message_ balance so recovery spends only the inbound value — good intent, but if the
  inbound value is below the failure floor the recovery send is simply dropped.

---

## 4. Findings

Severity: impact on a launched pool. IDs are `V#` (value-validation), referenced from `AUDIT_REPORT.md`.

- **🟠 V1 — No entry-value floor on any pool entrypoint.** `onLockOrBurn`, `onReleaseOrMint`,
  `onLockOrBurnTransfer` never assert a minimum `msgValue`. A Router/executor bug, a gas-price
  increase, or an attacker minimising attached value can drive a flow into OOG or an unfundable
  failure. Ramps gate every entrypoint; pools gate none. **This is the core gap.**

- **🟠 V2 — `forwardTonAmount = ton("0.01")` almost certainly < the LockOrBurn failure floor.** The
  value that funds the custody-bearing `onLockOrBurnTransfer` is the executor's hardcoded
  `forwardTonAmount` (`burn_mint/contract.tolk:354`, `lock_release/contract.tolk:142`,
  `lock_release_lockbox/contract.tolk:152,282`, all tagged `TODO: make dynamic`). The failure path
  from there is `returnTransfer` (a jetton transfer nominally worth `RETURN_TRANSFER_VALUE = ton("0.1")`)
  **plus** a `notifyLockOrBurnFailure` reply. `0.01 TON` cannot fund a `0.1 TON` return — so a failed
  lock either (a) silently drops the return (`IGNORE_ERRORS`) or (b) the pool subsidises `0.1` from its
  own balance. Both violate the invariant. This is the highest-value concrete fix.

- **🟡 V3 — Lockbox has an explicit, unresolved value TODO.** `JettonLockBox.tolk:147`
  (`// TODO: check message value is enough to cover full flow, or error`). `onWithdraw` sends
  `AskToTransfer(CARRY_ALL | BOUNCE_ON_ACTION_FAIL)` with no reserve, so an underfunded withdraw may
  not fund the `WithdrawFailed` bounce reply (`ANALYSIS_ERROR_HANDLING.md` D3).

- **🟡 V4 — Fixed `value:` sends draw from pool balance on shortfall.** `BURN_VALUE`, `MINT_VALUE`,
  `OFF_RAMP_ACCOUNT_DEPLOY_VALUE`, `RETURN_TRANSFER_VALUE`, `forwardTonAmount` are absolute constants
  sent with `PAY_FEES_SEPARATELY`. If the inbound value is less than their sum, the difference comes
  from balance — the silent self-subsidy / rent-drain vector.

- **🟡 V5 — Static constants will drift.** All pool value constants are hardcoded `ton("…")`, tuned to
  current gas/forward prices and message shapes. No use of `calculateGasFee`/`fwdFee` like CCT. A
  governance gas-price change invalidates them with no compile-time or runtime signal.

- **🔵 V6 — No size-scaling for variable payloads.** `applyChainUpdates` (snake list of `chainsToAdd`),
  `getCCVs` (CCV address lists), and variable `sourcePoolData`/`extraData`/`destPoolData` make real
  forward cost payload-dependent, but nothing accounts for it.

---

## 5. The invariant to enforce

> **Fail-safe-floor invariant.** No custody-bearing flow may advance to a hop it cannot afford to
> _fail out of_. Concretely, at every entrypoint/continuation `h`:
>
> `msgValue ≥ min( cost(happy-path from h) , cost(safe-fail from h) ) + BUFFER`
>
> and the code must _branch on which one holds_:
>
> - `msgValue ≥ cost(happy-path) + BUFFER` → proceed.
> - `cost(safe-fail) + BUFFER ≤ msgValue < cost(happy-path) + BUFFER` → **do not proceed**; take the
>   safe-fail path (refund RL + return custody + notify) deterministically.
> - `msgValue < cost(safe-fail) + BUFFER` → this state must be **unreachable for custody-bearing
>   handlers**: it is the admitting entrypoint's job to refuse (bounce, pre-custody) or to have
>   _forwarded_ at least `cost(safe-fail)` into the next hop.

Corollary (value-budget propagation): the admitting entrypoint (`onLockOrBurn` / `onReleaseOrMint`,
which still hold the ability to bounce because no custody has moved) must assert the **full
happy-path** cost, and must attach to each downstream hop at least that hop's own safe-fail floor —
so no later, non-bounceable handler is ever below its floor.

---

## 6. Proposed model

### 6.1 Two-tier cost per handler

For each handler define two numbers:

- **`H` (happy cost):** compute + all forwards to complete the flow from here (size-aware).
- **`F` (fail floor):** compute + the safe-fail work reachable from here: refund RL (storage-only,
  no message), return custody (≤1 jetton transfer), notify requester (1 reply). `F ≪ H` in general.

`F` is the number that must _always_ be present (or pre-funded by the previous hop). `H` is what the
admitting entrypoint checks to decide happy-vs-fail.

### 6.2 A shared `TokenPool_Costs` cost library (mirrors `OnRamp_Costs`)

Introduce `lib/token_pool/costs.tolk`:

```tolk
// Static first cut (fast to land, mirrors the ramps):
fun TokenPool_Costs.failFloor(): int      { return ton("0.15"); }   // return(0.1)+notify+buffer
fun TokenPool_Costs.lockOrBurnHappy(): int{ return ton("0.20"); }   // burn/lock/lockbox worst case
fun TokenPool_Costs.releaseHappy(): int   { return ton("0.30"); }   // OAA deploy + mint/withdraw + notify
fun TokenPool_Costs.forwardTon(): int     { return ton("0.05"); }   // TransferNotification forward budget
```

Assert at entrypoints; carry `failFloor()` as the `forwardTonAmount` (replacing the `0.01` in V2).

### 6.3 Make it dynamic (the "better than ramps" answer)

Replace the constants with runtime estimation reusing the CCT primitives (`calculateGasFee`,
`getForwardFee`/`fwdFee`, `getStorageDuePayment`, `forwardInitStateOverhead`). Model each flow as a
list of hops, each declaring `(computeGas, numForwards, attachedValue)`:

```tolk
struct Hop { computeGas: int; forwards: int; attached: int; }

fun costOf(hops, fwdFee: int): int {
    var total = 0;
    foreach h in hops:
        total += calculateGasFee(MY_WORKCHAIN, h.computeGas)  // gas→TON at CURRENT price
               + h.forwards * fwdFee                          // real forward fee (size-derived)
               + h.attached;                                  // value that must survive the hop
    return total + getStorageDuePayment() + BUFFER;
}
```

This is price-adaptive (gas price change → recomputed) and size-adaptive (`fwdFee` derived from the
actual message via `getOriginalFwdFee`/config-25). `computeGas` per hop can be measured once from the
gas-report harness (`yarn ccip-gas-report`) and encoded as named constants, or read from
`getPrecompiledGasConsumption()` where available. Keep a static fallback for hops the estimator can't
see.

### 6.4 Per-entrypoint required-value table (where to assert)

| Handler                                                       | Custody held? | Can bounce?      | Assert                                                       | On shortfall                                            |
| ------------------------------------------------------------- | ------------- | ---------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| `onLockOrBurn` (Router)                                       | no            | yes              | `msgValue ≥ lockOrBurnHappy`                                 | throw → RichBounce to Router (safe; no custody)         |
| `onReleaseOrMint` (Router)                                    | no            | yes              | `msgValue ≥ releaseHappy`                                    | throw → RichBounce to Router                            |
| `onLockOrBurnTransfer` (wallet)                               | **yes**       | no               | `msgValue ≥ failFloor` guaranteed by V2 fix                  | if `< happy` but `≥ failFloor`: return custody + notify |
| `onLockOrBurnWithdraw` fwd (→executor)                        | no            | —                | attach `≥ failFloor` (so the notification handler is funded) | n/a                                                     |
| `*_Reply` / `Deposited` / `ForwardNotification` continuations | maybe         | (bounce-handled) | check remaining ≥ next-hop `failFloor`                       | divert to failure reply                                 |
| `JettonLockBox.onWithdraw`                                    | vault         | (bounce)         | `msgValue ≥ withdrawCost` (closes V3)                        | reject before send                                      |

The two Router-facing entrypoints are the cheap, high-value wins: they _can_ bounce (no custody yet),
so a floor check there converts "silent OOG later" into "clean rejection now."

### 6.5 Value-budget propagation

The admitting entrypoint attaches `failFloor()` (not `0.01`) to the hop that will hand back custody
(the executor's `forwardTonAmount`, and the pool→wallet/minter/lockbox forwards). Then every
non-bounceable continuation is guaranteed `≥ failFloor` by construction and never needs to touch pool
balance. This is the concrete remedy for V2/V4.

### 6.6 Buffer policy

`BUFFER` absorbs gas-price rounding, `fwdFee` estimation error, and cross-hop drift. Recommend a
combined `max(ton("0.02"), 15% of estimate)` additive+multiplicative buffer, tuned against the gas
report. Document the assumed gas-price ceiling so the static fallback's validity window is explicit.

---

## 7. Phased implementation plan

1. **Phase 1 (cheap, high value, low risk): static floors on the two Router entrypoints.**
   Add `TokenPool_Costs` with static constants; assert `lockOrBurnHappy` / `releaseHappy` in
   `onLockOrBurn` / `onReleaseOrMint`. These bounce cleanly (no custody), so a too-low value becomes a
   Router-visible failure instead of a stranded flow. Closes the reachable part of V1. Measure real
   costs with `yarn ccip-gas-report` to set the constants.
2. **Phase 2: fix the failure-floor carry (V2).** Replace `forwardTonAmount = ton("0.01")` with
   `TokenPool_Costs.failFloor()` on the executor transfer and the pool→wallet/minter/lockbox forwards,
   so `onLockOrBurnTransfer` and continuations are always above `failFloor`. Add a `msgValue ≥ failFloor`
   assert at `onLockOrBurnTransfer` as a tripwire (should be unreachable-if-false after the carry fix).
3. **Phase 3: lockbox (V3).** Add the value check + reserve in `JettonLockBox.onWithdraw`/deposit.
4. **Phase 4: go dynamic (V5/V6).** Swap the static constants for the `costOf(hops, fwdFee)` estimator
   built on `calculateGasFee`/`fwdFee`/`getStorageDuePayment`, with the static values as fallback.
5. **Phase 5: tests.** Per pool: (a) entrypoint rejects when `value < floor` and bounces to the
   Router; (b) a lock whose executor transfer is minimally funded still finalizes-or-fails without
   touching pool balance (assert pool balance unchanged across a forced failure); (c) gas-report
   regression so the constants can't silently drift.

---

## 8. Open questions for the team

1. **Who owns the happy-path budget — Router/executor or pool?** If the Router always over-funds
   (`Vr` large) and the executor sets `forwardTonAmount` correctly, Phase 1+2 asserts are tripwires.
   If not, the pool must be the enforcement point. Confirm the executor is under our control to set
   `forwardTonAmount = failFloor` (Phase 2).
2. **Static vs dynamic for launch.** Phase 1–3 (static) is low-risk and probably sufficient for
   launch if we pin a gas-price ceiling; Phase 4 (dynamic) is the durable answer but touches
   gas-critical paths and needs the gas harness. Which do we want before audit?
3. **Buffer sizing / gas-price assumption.** What gas-price ceiling do we design the static floors
   against, and what happens (design-wise) if governance raises gas above it — reject, or self-subsidy
   with an alert event?
4. **Failure-floor exactness.** Is one jetton return + one reply the true worst-case safe-fail for
   every pool, or can a pool owe more than one return (e.g. multi-transfer fee withdrawals)? This sets
   `failFloor`.

---

## 9. Cross-references

- `ANALYSIS_ERROR_HANDLING.md` — G5 (best-effort returns can silently no-op when underfunded) and D3
  (lockbox reserve) are the failure-side symptoms this model prevents at the source.
- `AUDIT_REPORT.md` — V1–V6 recorded there under the value-validation findings.
