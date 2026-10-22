// SPDX-License-Identifier: BUSL-1.1
import "../../../../lib/budget/gas"
import "../../../../lib/budget/min_value"

/// TON budget of one token-pool flow (LockOrBurn or ReleaseOrMint).
///
/// - `admission`: checked at the flow entrypoint and published to CCIP. Covers the whole flow.
/// - `safety`: checked in the last pool transaction before custody moves (burn, lockbox deposit,
///   mint or release). Covers everything after it.
///
/// A caller-declared continuation (`delivery.forwardTonAmount`) is checked on top. Values are
/// empirical (gas-report tests) and buffered. See docs/contracts/overview/ccip/budget/TP-VALUE-BUDGET-AUDIT.md.
struct TokenPool_FlowBudget {
    admission: coins = 0;
    safety: coins = 0;
}

/// Per-instance budget. In storage, a zero field means "use the pool-type default".
struct TokenPool_Budget {
    lockOrBurn: TokenPool_FlowBudget = {};
    releaseOrMint: TokenPool_FlowBudget = {};
}

/// Default gap between admission and safety: the entry transaction and the hops before the
/// safety check. Raise admission per instance for async hooks.
const TOKEN_POOL_ADMISSION_ALLOWANCE_GAS_UNITS = BUDGET_UNITS_LVL3_HIGH;

/// A pool-type default derived from its safety value.
fun TokenPool_FlowBudget.fromSafety(safety: coins): TokenPool_FlowBudget {
    return {
        admission: safety + calculateMinValue(TOKEN_POOL_ADMISSION_ALLOWANCE_GAS_UNITS, 1),
        safety,
    };
}

/// Raise-only: a configured value can only raise the default, and admission always covers safety.
fun TokenPool_FlowBudget.over(self, floor: TokenPool_FlowBudget): TokenPool_FlowBudget {
    val safety = max(self.safety, floor.safety);
    return { admission: max(max(self.admission, floor.admission), safety), safety };
}

fun TokenPool_Budget.over(self, floor: TokenPool_Budget): TokenPool_Budget {
    return {
        lockOrBurn: self.lockOrBurn.over(floor.lockOrBurn),
        releaseOrMint: self.releaseOrMint.over(floor.releaseOrMint),
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
