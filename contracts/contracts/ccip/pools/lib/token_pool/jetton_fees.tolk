// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/gas-payments"

import "../../../cct/fees-management"

/// Fee model of the jetton wallet a pool transfers through.
///
/// A transfer's value pays the wallets' fees plus `forwardTonAmount`. The wallet rejects a transfer
/// whose value does not strictly exceed that sum, and sends what its fees did not use to
/// `sendExcessesTo`. The model is the reference wallet's own check
/// (`cct/fees-management.checkAmountIsEnoughToTransfer`), pinned to measured gas by the gas-report
/// tests.
enum JettonWalletFees {
    /// CCT: the reference model.
    Reference
    /// Any other wallet: the reference model, doubled.
    Generic
}

const JETTON_GENERIC_WALLET_FEE_MULTIPLIER = 2;

/// Forward fee a wallet reads as `in.originalForwardFee` for an incoming message quoted at
/// `fwdFee`. TVM rebuilds it from the forwarded part with a floor division, which exceeds the
/// quote by at most 1 nanoton.
fun receivedForwardFee(fwdFee: coins): coins {
    return fwdFee + 1;
}

/// Least value above `forwardTonAmount` the wallet accepts for one transfer whose incoming message
/// is quoted at `fwdFee`. The final nanoton satisfies the wallet's strict `>` check.
fun JettonWalletFees.transferFee(self, fwdFee: coins, hasForward: bool): coins {
    val fwdCount = hasForward ? 2 : 1;
    val reference = fwdCount * receivedForwardFee(fwdFee)
        + forwardInitStateOverhead()
        + calculateGasFee(MY_WORKCHAIN, GAS_CONSUMPTION_JettonTransfer)
        + calculateGasFee(MY_WORKCHAIN, GAS_CONSUMPTION_JettonReceive)
        + calculateJettonWalletMinStorageFee();
    val multiplier = self == JettonWalletFees.Reference ? 1 : JETTON_GENERIC_WALLET_FEE_MULTIPLIER;
    return reference * multiplier + 1;
}

/// Value to attach to a transfer that delivers `forwardTonAmount`.
fun JettonWalletFees.transferValue(self, forwardTonAmount: coins, fwdFee: coins): coins {
    return forwardTonAmount + self.transferFee(fwdFee, forwardTonAmount != 0);
}
