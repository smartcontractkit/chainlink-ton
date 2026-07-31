# LockReleaseLockboxTokenPool - Pre-Publish Code Review

## Executive Summary

This is a deep, pre-publish review comparing the TON `LockReleaseLockboxTokenPool` implementation against the EVM `LockReleaseTokenPool`. Overall the architecture is sound, but there are several items worth addressing before publish.

---

## Architecture Comparison: TON vs EVM

### EVM (Synchronous)

```
User → Router → LockReleaseTokenPool._lockOrBurn()
  └── i_lockBox.deposit() [synchronous, atomic]
  └── emit LockedOrBurned() [same tx]
```

### TON (Asynchronous Message Chains)

```
User → Pool wallet → TransferNotificationForRecipient → pool
  └── onLockOrBurnTransferContinue() [store pending lock]
    └── AskToTransfer [to pool wallet]
      └── TransferNotificationForRecipient [to lockbox wallet]
        └── JettonLockBox_Deposited [to pool]
          └── onLockDepositCompleted() [finalize + emit event]
```

**Key difference**: TON emits `TokenPool_LockedOrBurned` **asynchronously** (when lockbox callback arrives), while EVM emits `LockedOrBurned` **synchronously** (in same call). This is a known TON architectural constraint, not a bug.

---

## 🔴 Critical Issues (Fix Before Publish)

### 1. Silent Failure on Bounced Lock Transfers

**Location**: `contract.tolk:193-203` - `onLockTransferBounced`

```tolk
fun onLockTransferBounced(...) {
    val pendingEntry = st.pendingLocks.get(msg.queryId);
    if (!pendingEntry.isFound) { return; }
    val pending = pendingEntry.loadValue().load();
    st.pendingLocks.delete(msg.queryId);
    // TODO: try to best-effort return jettons or emit error event
}
```

**Problem**: When the AskToTransfer bounces (lockbox wallet can't accept, insufficient TON, etc.):

- Pending lock is silently deleted
- NO error event emitted
- NO reply sent to Router/OnRamp
- Jettons are already transferred to the pool's wallet - they're "stuck" in the pool but the lock never completed
- Off-chain relayer will see the lock never finalized and may retry, but the jettons are already on the pool

**EVM comparison**: EVM is atomic - if the deposit fails, the entire tx reverts. No stuck state possible.

**Fix options**:

1. Emit a `TokenPool_LockOrBurnFailed` event with error code
2. Send `TokenPool_ReleaseOrMintFailure` to replyTo (matching release flow pattern)
3. Consider trying to bounce jettons back (best-effort return)

### 2. Hardcoded TON Values in Messages

**Location**: `contract.tolk:157, 244` - `onLockOrBurnTransferContinue` and `onReleaseOrMintContinue`

```tolk
val transfer = createMessage({
    value: ton("0.1"),  // Hardcoded!
    ...
});
```

**Problem**: `ton("0.1")` is hardcoded for both:

- Lock flow: AskToTransfer to jetton wallet
- Release flow: JettonLockBox_Withdraw to lockbox

This doesn't account for:

- Gas price fluctuations
- Complex forward payloads that need more gas
- Future TON fee changes

**EVM comparison**: EVM uses `msg.value` from the caller - gas is explicit.

**Recommendation**: Consider making this configurable, or at minimum add a comment explaining why 0.1 TON is sufficient.

### 3. Incorrect Error Code in WithdrawFailed Handler

**Location**: `contract.tolk:287` - `onReleaseWithdrawFailed`

```tolk
body: TokenPool_ReleaseOrMintFailure {
    queryId: msg.queryId,
    errorCode: TokenPool_Error.UnsupportedOperation as uint16,
},
```

**Problem**: Uses `TokenPool_Error.UnsupportedOperation` as the error code when the lockbox withdraw failed. This is misleading - `UnsupportedOperation` is for when the pool type can't handle a request, not when the lockbox reports a failure.

**Recommendation**: Use a more appropriate error code. Consider adding `TokenPool_Error.LockboxWithdrawFailed` to the error enum.

---

## 🟡 Medium Priority Issues

### 4. No Validation of Lockbox Token Support

**Location**: Constructor / deployment

**Problem**: EVM's `LockReleaseTokenPool.sol` validates in constructor:

```solidity
if (!lockBoxContract.isTokenSupported(address(token))) {
    revert InvalidToken(address(token));
}
```

TON's `LockReleaseLockboxTokenPool` does NOT validate that the lockbox supports the token at deployment time. A misconfigured pool could be deployed with an unsupported token.

**Recommendation**: Add validation during deployment/setup.

### 5. QueryId Collision Window

**Problem**: `pendingLocks` and `pendingReleases` are maps keyed by `uint64` queryId. While 64-bit gives a large space, there's no protection against intentional queryId reuse (e.g., if the Router sends duplicate requests with the same queryId).

**Current mitigation**: Duplicate rejection tests pass (exit codes 48700, 48702).

**Recommendation**: Consider adding TTL or cleanup for stale pending entries. A pending lock that never gets `JettonLockBox_Deposited` callback could block that queryId forever.

### 6. `transferInitiator` Trust Model

**Location**: `token_pool.tolk:834-836`

```tolk
// TODO: can we trust (any) JettonWallet forward payloads?
// assert(request.amount == msg.jettonAmount, TokenPool_Error.AmountMismatch);

if (msg.transferInitiator != null) {
    self.onLockOrBurnTransferContinue(sender, fwdp);
    return;
}
```

**Problem**: The pool trusts ANY transfer with `transferInitiator != null`. This means any JettonWallet can forward a crafted `TokenPool_LockOrBurnForwardPayload` to the pool. The pool processes it as a valid lock request.

**Impact**: While the lockbox validates the operator role, a malicious wallet could:

1. Send jettons with crafted forward payload
2. Pool forwards to lockbox
3. Lockbox rejects (operator check)
4. Jettons return to pool
5. Pool has no way to track this "bounce" state

**Recommendation**: At minimum, add validation that `forwardPayload.amount == msg.jettonAmount` before processing.

### 7. No Test for `onLockDepositCompleted` Path

**Location**: Full lock flow test

**Problem**: The test explicitly states:

> "In the sandbox, the lockbox wallet is a standard jetton wallet (not JettonLockBox contract). It returns excesses but does NOT send JettonLockBox_Deposited back to finalize."

This means the `onLockDepositCompleted` function is **never tested end-to-end**. The event emission path (`TokenPool_LockedOrBurned`) is untested.

**Recommendation**: Consider integrating the actual JettonLockBox contract in the full lock flow test (not just the wallet). This may require the JettonLockBox to be deployed as a real contract in the sandbox.

### 8. Redundant Comment in `onReturnExcessesBack`

**Location**: `contract.tolk:270, 313`

The comment block appears **twice** (lines 270-275 and 313-318):

```tolk
/* --- ReturnExcessesBack handler --- */
/*
 * For lock flow: just accept TON, do nothing. Completion comes from JettonLockBox_Deposited.
 * For release flow: this IS the completion signal. Restore context, finalize release flow.
 */
```

**Recommendation**: Remove the duplicate.

---

## 🟢 Low Priority / Polish

### 9. Test: "should return jettons for transfers without transferInitiator" is a Comment-Only Test

**Location**: Test file

```typescript
it('should return jettons for transfers without transferInitiator (direct user transfers)', async () => {
  // ... 8 lines of comments ...
  // No assertions!
})
```

**Recommendation**: Either:

- Remove this test (the logic is in TokenPool library, not pool-specific)
- Or make it an actual test that verifies the behavior

### 10. Test File Uses `require('zlib')` Inline

**Location**: Test file, line 195

```typescript
const { crc32 } = require('zlib')
```

**Recommendation**: Move to top-level imports for consistency.

### 11. Unused `lockboxOperator` Treasury Account

**Location**: Test file

```typescript
let lockboxOperator: SandboxContract<TreasuryContract>
```

Declared but never used.

### 12. Unused `pool` Variable Alias

**Location**: Test file

```typescript
let pool: SandboxContract<TokenPool>
```

Used for `runTokenPoolBehaviorTests` but not in pool-specific tests. Consider documenting this alias pattern.

### 13. Consider Adding `getPendingLocksCount` and `getPendingReleasesCount` Getters

**Current state**: Only `getHasPendingLock(queryId)` and `getHasPendingRelease(queryId)` exist.

**Recommendation**: Adding count getters would help operators monitor pending flow health and detect stuck flows.

### 14. Contract Version String

**Location**: `contract.tolk:24`

```tolk
version: "0.1.0"
```

**Recommendation**: Consider bumping to "1.0.0" for publish, matching EVM's `LockReleaseTokenPool 2.0.0` pattern.

---

## Test Coverage Analysis

### ✅ Covered Well

- [x] TokenPool shared behavior tests (21 tests - access control, cursed state, chain config)
- [x] Getter verification (lockbox, token, decimals)
- [x] Pending lock creation (2 tests)
- [x] Pending release creation with JettonLockBox_Withdraw assertion
- [x] Duplicate lock rejection (exit code 48700)
- [x] Duplicate release rejection (exit code 48702)
- [x] Release flow rejection when insufficient lockbox balance
- [x] Full lock flow (partial - through AskToTransfer)
- [x] Full release flow (complete - through ReturnExcessesBack)
- [x] Cursed state blocking

### ⚠️ Partially Covered

- [x] Full lock flow: ends at jetton transfer to lockbox wallet, does NOT complete with JettonLockBox_Deposited callback
- [x] `onLockTransferBounced`: not tested (TODO in code)
- [x] `onReleaseWithdrawFailed`: not tested end-to-end (only tested that insufficient balance rejects upfront)

### ❌ Not Covered

- [ ] `onLockDepositCompleted` (JettonLockBox_Deposited callback)
- [ ] `TokenPool_LockedOrBurned` event emission
- [ ] `onLockTransferBounced` error path
- [ ] `onReleaseWithdrawFailed` callback from actual lockbox failure
- [ ] QueryId cleanup / TTL
- [ ] Forward payload validation (amount mismatch)

---

## Recommendations Summary (Prioritized)

### Fix Before Publish

1. **Add error event + reply in `onLockTransferBounced`** (critical - silent failure)
2. **Fix error code in `onReleaseWithdrawFailed`** (misleading error code)
3. **Remove duplicate comment block** (cleanup)

### Should Fix Before Publish

4. **Replace comment-only test with actual test or remove it**
5. **Fix `transferInitiator` trust model** (at minimum add amount validation)
6. **Move `require('zlib')` to top-level import**

### Nice to Have

7. Add `getPendingLocksCount` / `getPendingReleasesCount` getters
8. Integrate real JettonLockBox in full lock flow test
9. Bump version to "1.0.0" for publish
10. Remove unused `lockboxOperator` variable
11. Consider configurable gas amounts instead of hardcoded `ton("0.1")`
12. Consider queryId TTL/cleanup mechanism
