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

/// Minimum deposit value: handler gas plus both outbound fees. `fwdFee` is a per-message proxy:
/// the lockbox passes the reply fee; the pool passes the larger deposit-transfer fee.
fun JettonLockBox_minDepositValue(fwdFee: coins): coins {
    val w = contract.getAddress().getWorkchain();
    return calculateGasFee(w, JettonLockBox_DEPOSIT_GAS_UNITS)
        + JettonLockBox_DEPOSIT_FWD_COUNT * fwdFee;
}

/// Minimum value a withdraw message must carry: the wallet transfer plus the lockbox's own work.
/// Uses the generic fee model because the recipient wallet may be non-CCT or undeployed; the
/// reference model would underfund those transfers.
fun JettonLockBox_minWithdrawValue(forwardTonAmount: coins, fwdFee: coins): coins {
    val w = contract.getAddress().getWorkchain();
    return JettonFees.Generic.transferValue(forwardTonAmount, fwdFee)
        + calculateGasFee(w, JettonLockBox_WITHDRAW_GAS_UNITS);
}
