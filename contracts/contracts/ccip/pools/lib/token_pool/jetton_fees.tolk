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

/// The pre-send quote and the wallet's `originalForwardFee` check are not bit-exact: the quote is
/// built from the not-yet-final message (placeholder value, serialization changes), so the wallet
/// can require a few dozen nanotons more than the quote. Keep a small explicit margin rather than
/// relying on the strict-`>` `+1` alone; this is negligible against `S`.
const JETTON_WALLET_FEE_MARGIN = 1_000;

/// Least value above `forwardTonAmount` the wallet accepts for one transfer whose incoming message
/// is quoted at `fwdFee`. `JETTON_WALLET_FEE_MARGIN` satisfies the wallet's strict `>` check and
/// absorbs quote drift.
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
    return reference * multiplier + JETTON_WALLET_FEE_MARGIN;
}

/// Value to attach to a transfer that delivers `forwardTonAmount`.
fun JettonWalletFees.transferValue(self, forwardTonAmount: coins, fwdFee: coins): coins {
    return forwardTonAmount + self.transferFee(fwdFee, forwardTonAmount != 0);
}
