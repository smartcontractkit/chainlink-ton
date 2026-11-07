// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/gas-payments"

import "../../../lib/gas"
import "../lib/token_pool/jetton_fees"

/// Lockbox deposit gas budget. Covers the happy-path handler and a small reply buffer. Failure
/// returns are best-effort and may require more value; the min must not block a viable success.
/// Calibrated by `tests/gas-report/pools/lockbox.spec.ts`; callers add their own finalization.
const JettonLockBox_DEPOSIT_GAS_UNITS = BUDGET_UNITS_LVL1_LOW;

/// Lockbox withdraw gas budget. Covers the handler's own compute and event. Calibrated by the
/// same gas report.
const JettonLockBox_WITHDRAW_GAS_UNITS = BUDGET_UNITS_LVL0_MIN;

/// Minimum value a deposit notification must carry for the happy path: the handler plus the
/// caller-estimated `JettonLockBox_Deposited` reply fee. Pool finalization and any failure return
/// are the caller's responsibility; a shortfall must not reject a deposit whose success
/// continuation is funded.
fun JettonLockBox_minDepositValue(replyFee: coins): coins {
    return calculateGasFee(contract.getAddress().getWorkchain(), JettonLockBox_DEPOSIT_GAS_UNITS)
        + replyFee;
}

/// Minimum value a withdraw message must carry: the wallet transfer plus the lockbox's own work.
fun JettonLockBox_minWithdrawValue(forwardTonAmount: coins, fwdFee: coins): coins {
    return JettonFees.Reference.transferValue(forwardTonAmount, fwdFee)
        + calculateGasFee(contract.getAddress().getWorkchain(), JettonLockBox_WITHDRAW_GAS_UNITS);
}
