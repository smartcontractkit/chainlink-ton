// SPDX-License-Identifier: BUSL-1.1

/// TON budgets of a token pool: empirical (gas-report tests), with pool-type defaults that each
/// instance can raise (`TokenPool_SetBudget`). In storage, a zero field means "use the default".
/// See docs/contracts/overview/ccip/budget/TP-VALUE-BUDGET-AUDIT.md.

/// - `admission`: checked at the entrypoint and published to CCIP. Pays the flow up to the pool's
///   last custody move.
/// - `safety`: forwarded with the pool's last custody move (the custody transfer to a burning pool,
///   the deposit to a lockbox). Pays finalization or recovery.
struct TokenPool_LockOrBurnBudget {
    admission: coins = 0;
    safety: coins = 0;
}

/// - `admission`: checked at the entrypoint and published to CCIP as the remote chain's
///   `destGasOverhead`. The delivery's forward is the caller's (`delivery.forwardTonAmount`).
struct TokenPool_ReleaseOrMintBudget {
    admission: coins = 0;
}

struct TokenPool_Budget {
    lockOrBurn: TokenPool_LockOrBurnBudget = {};
    releaseOrMint: TokenPool_ReleaseOrMintBudget = {};
}

/// Raise-only: a configured value can only raise the default, and admission always covers safety.
fun TokenPool_LockOrBurnBudget.over(self, floor: TokenPool_LockOrBurnBudget): TokenPool_LockOrBurnBudget {
    val safety = max(self.safety, floor.safety);
    return { admission: max(max(self.admission, floor.admission), safety), safety };
}

fun TokenPool_Budget.over(self, floor: TokenPool_Budget): TokenPool_Budget {
    return {
        lockOrBurn: self.lockOrBurn.over(floor.lockOrBurn),
        releaseOrMint: { admission: max(self.releaseOrMint.admission, floor.releaseOrMint.admission) },
    };
}

/// Admission budgets the pool publishes to CCIP.
struct TokenPool_AdmissionBudget {
    lockOrBurn: coins;
    releaseOrMint: coins;
}

fun TokenPool_Budget.admission(self): TokenPool_AdmissionBudget {
    return {
        lockOrBurn: self.lockOrBurn.admission,
        releaseOrMint: self.releaseOrMint.admission,
    };
}
