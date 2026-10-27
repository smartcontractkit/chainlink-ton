// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/gas-payments"

import "../../../cct/fees-management"

/// Fee model of the jetton wallet a pool transfers through.
///
/// The model is the reference wallet's own cost functions (`cct/fees-management`),
/// pinned to measured gas by the gas-report tests.
enum JettonFees {
    /// CCT: the reference model.
    Reference
    /// Any other wallet: the reference model, doubled.
    Generic
}

/// Non-CCT wallets are charged the doubled reference fee. The margin absorbs quote drift between
/// the pre-send estimate and the wallet's `originalForwardFee` check.
const JETTON_FEE_GENERIC_MULTIPLIER = 2;
const JETTON_FEE_MARGIN = 1_000;

/// Value above `forwardTonAmount` the wallet accepts for one transfer whose incoming message
/// is quoted at `fwdFee`. The final margin satisfies the wallet's strict `>` check.
fun JettonFees.transferFee(
    self,
    fwdFee: coins,
    hasForward: bool,
    generic: int = JETTON_FEE_GENERIC_MULTIPLIER,
): coins {
    val usePrecompiledGas = false;
    val fee = calculateTransferFee(hasForward ? 1 : 0, fwdFee, usePrecompiledGas);
    val multiplier = self == JettonFees.Reference ? 1 : generic;
    return fee * multiplier + JETTON_FEE_MARGIN;
}

/// Value to attach to a transfer that delivers `forwardTonAmount`.
fun JettonFees.transferValue(
    self,
    forwardTonAmount: coins,
    fwdFee: coins,
    generic: int = JETTON_FEE_GENERIC_MULTIPLIER,
): coins {
    return forwardTonAmount + self.transferFee(fwdFee, forwardTonAmount != 0, generic);
}

/// Value to attach to a burn operation that requires `hasExcesses` and pays `fwdFee`.
fun JettonFees.burnValue(
    self,
    fwdFee: coins,
    hasExcesses: bool,
    generic: int = JETTON_FEE_GENERIC_MULTIPLIER,
): coins {
    val usePrecompiledGas = false;
    val fee = calculateBurnRequiredValue(fwdFee, hasExcesses, usePrecompiledGas);
    val multiplier = self == JettonFees.Reference ? 1 : generic;
    return fee * multiplier + JETTON_FEE_MARGIN;
}
