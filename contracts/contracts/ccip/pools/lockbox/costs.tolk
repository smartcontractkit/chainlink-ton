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

/// Execution budget above the rent reserve for initialization: role replies/notifications and
/// the init reply. This is spent on init messages, not retained as reserve.
fun JettonLockBox_Costs.init(): coins {
    return grams("0.05");
}

/// Deposit value: handler gas plus both outbound fees.
fun JettonLockBox_Costs.deposit(fwdFee: coins): coins {
    val w = contract.getAddress().getWorkchain();
    return calculateGasFee(w, JettonLockBox_DEPOSIT_GAS_UNITS)
        + JettonLockBox_DEPOSIT_FWD_COUNT * fwdFee;
}

/// Withdraw value: the generic wallet transfer plus the lockbox's own work.
fun JettonLockBox_Costs.withdraw(forwardTonAmount: coins, fwdFee: coins): coins {
    val w = contract.getAddress().getWorkchain();
    return JettonFees.Generic.transferValue(forwardTonAmount, fwdFee)
        + calculateGasFee(w, JettonLockBox_WITHDRAW_GAS_UNITS);
}
