// SPDX-License-Identifier: BUSL-1.1
// Test-only harness exposing the token-pool cost model as getters.
//
// The gas/harness tests compare these on-chain estimates with measured sandbox costs so the
// funding assumptions and the measured jetton costs stay in lockstep. The getters call the exact
// cost functions the pools use; tests never duplicate the constants.

import "@stdlib/gas-payments"

import "../../ccip/pools/lib/token_pool/budget"
import "../../ccip/pools/lib/token_pool/jetton_fees"

contract TokenPoolCostHarness {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.test.gas.TokenPoolCostHarness"
}

fun onInternalMessage(in: InMessage) {
    assert (in.body.isEmpty()) throw (0xFFFF)
}

/// Pool finalization budget. On a rejected lockbox deposit this is what remains after the
/// failure report, so it must also cover the reference-cost fee-refund transfer.
get fun get_finalization(): coins { return TokenPool_Costs.finalization(); }

get fun get_callerFinalization(): coins { return TokenPool_Costs.callerFinalization(); }

/// Value to attach to a reference jetton transfer carrying `forwardTonAmount`.
get fun get_referenceTransferValue(forwardTonAmount: coins, fwdFee: coins): coins {
    return JettonFees.Reference.transferValue(forwardTonAmount, fwdFee);
}
