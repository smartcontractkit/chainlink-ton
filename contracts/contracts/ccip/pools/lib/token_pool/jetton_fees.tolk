// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/gas-payments"

import "../../../cct/fees-management"

/// Fee model of the jetton wallet a pool transfers through.
///
/// A transfer's value pays the wallets' fees plus `forwardTonAmount`. The wallet rejects a transfer
/// whose value does not strictly exceed that sum, and sends what its fees did not use to
/// `sendExcessesTo`. The model is the reference wallet's own check
/// (`cct/fees-management.checkAmountIsEnoughToTransfer`), pinned to measured gas by the gas-report tests.
enum JettonWalletFees {
    /// CCT: the reference model.
    Reference
    /// Any other wallet: the reference model, doubled.
    Generic
}

const JETTON_GENERIC_WALLET_FEE_MULTIPLIER = 2;

/// Least value above `forwardTonAmount` the wallet accepts for one transfer whose incoming message
/// is quoted at `fwdFee`. The final nanoton satisfies the wallet's strict `>` check.
fun JettonWalletFees.transferFee(self, fwdFee: coins, hasForward: bool): coins {
    val fwdCount = hasForward ? 2 : 1; // second sending (forward) will be cheaper than first
    val reference = 0
        // 3 messages: wal1->wal2,  wal2->owner, wal2->response
        // but last one is optional (it is ok if it fails)
        + fwdCount * fwdFee
        + forwardInitStateOverhead()
        + calculateGasFee(MY_WORKCHAIN, GAS_CONSUMPTION_JettonTransfer)
        + calculateGasFee(MY_WORKCHAIN, GAS_CONSUMPTION_JettonReceive)
        + calculateJettonWalletMinStorageFee();
    val multiplier = self == JettonWalletFees.Reference ? 1 : JETTON_GENERIC_WALLET_FEE_MULTIPLIER;
    val buffer = 1; // extra nanoton to satisfy the wallet's strict `>` check
    return reference * multiplier + buffer;
}

/// Value to attach to a transfer that delivers `forwardTonAmount`.
fun JettonWalletFees.transferValue(self, forwardTonAmount: coins, fwdFee: coins): coins {
    return forwardTonAmount + self.transferFee(fwdFee, forwardTonAmount != 0);
}
