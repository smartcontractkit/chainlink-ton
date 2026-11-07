// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/gas-payments"

import "../../../lib/gas"
import "../lib/token_pool/jetton_fees"

/// Lockbox deposit gas budget. Covers the handler's own compute and the custody-return value on
/// the more expensive failure branch. Calibrated by `tests/gas-report/pools/lockbox.spec.ts`.
/// Callers add their own finalization budget on top.
const JettonLockBox_DEPOSIT_GAS_UNITS = 300_000;

/// Lockbox withdraw gas budget. Covers the handler's own compute and event. Calibrated by the
/// same gas report.
const JettonLockBox_WITHDRAW_GAS_UNITS = BUDGET_UNITS_LVL0_MIN;

/// Minimum value a deposit notification must carry to fund the lockbox side of either
/// continuation: the success reply or the custody return. Pool-specific finalization is added by
/// the caller, not here.
fun JettonLockBox_minDepositValue(): coins {
    return calculateGasFee(contract.getAddress().getWorkchain(), JettonLockBox_DEPOSIT_GAS_UNITS);
}

/// Minimum value a withdraw message must carry: the wallet transfer plus the lockbox's own work.
fun JettonLockBox_minWithdrawValue(forwardTonAmount: coins, fwdFee: coins): coins {
    return JettonFees.Reference.transferValue(forwardTonAmount, fwdFee)
        + calculateGasFee(contract.getAddress().getWorkchain(), JettonLockBox_WITHDRAW_GAS_UNITS);
}
