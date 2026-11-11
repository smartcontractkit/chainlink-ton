// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/gas-payments"

import "../../../lib/gas"
import "../lib/token_pool/jetton_fees"

/// Deposit gas budget. Reply and event-log forwarding fees are added separately; failure returns
/// are best-effort. Calibrated by `tests/gas-report/pools/lockbox.spec.ts`.
const JettonLockBox_DEPOSIT_GAS_UNITS = BUDGET_UNITS_LVL1_LOW;

/// Event log + confirmation reply.
const JettonLockBox_DEPOSIT_FWD_COUNT = 2;

/// Lockbox withdraw gas budget. Covers the handler's own compute and event. Calibrated by the
/// same gas report.
const JettonLockBox_WITHDRAW_GAS_UNITS = BUDGET_UNITS_LVL0_MIN;

struct JettonLockBox_Costs{}

/// Deposit value: handler gas plus both outbound fees, including the runtime rent reserve.
/// Pass `false` for the post-reserve check.
fun JettonLockBox_Costs.deposit(fwdFee: coins, includeRent: bool = true): coins {
    val w = contract.getAddress().getWorkchain();
    val cost = calculateGasFee(w, JettonLockBox_DEPOSIT_GAS_UNITS)
        + JettonLockBox_DEPOSIT_FWD_COUNT * fwdFee;
    return includeRent ? cost + MIN_GRAM_TO_RESERVE_RUNTIME : cost;
}

/// Withdraw value: the generic wallet transfer plus the lockbox's own work, including the runtime
/// rent reserve. Pass `false` for the post-reserve check.
fun JettonLockBox_Costs.withdraw(
    forwardTonAmount: coins,
    fwdFee: coins,
    includeRent: bool = true,
): coins {
    val w = contract.getAddress().getWorkchain();
    val cost = JettonFees.Generic.transferValue(forwardTonAmount, fwdFee)
        + calculateGasFee(w, JettonLockBox_WITHDRAW_GAS_UNITS);
    return includeRent ? cost + MIN_GRAM_TO_RESERVE_RUNTIME : cost;
}
