// SPDX-License-Identifier: BUSL-1.1
// Test-only harness exposing the JettonLockBox cost model as getters.
//
// The lockbox gas-report test compares these on-chain estimates with measured sandbox gas so the
// value checks and the measured costs stay in lockstep.

import "@stdlib/gas-payments"

import "../../ccip/pools/lockbox/costs"

contract JettonLockBoxCostHarness {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.test.gas.JettonLockBoxCostHarness"
}

fun onInternalMessage(in: InMessage) {
    assert (in.body.isEmpty()) throw 0xFFFF
}

get fun get_depositGasUnits(): int { return JettonLockBox_DEPOSIT_GAS_UNITS; }
get fun get_withdrawGasUnits(): int { return JettonLockBox_WITHDRAW_GAS_UNITS; }

get fun get_depositMinValue(): coins { return JettonLockBox_minDepositValue(); }
get fun get_withdrawMinValue(forwardTonAmount: coins, fwdFee: coins): coins {
    return JettonLockBox_minWithdrawValue(forwardTonAmount, fwdFee);
}

/// Price measured gas with the same on-chain config the cost functions use.
get fun get_calculateGasFee(gasUsed: int): coins {
    return calculateGasFee(contract.getAddress().getWorkchain(), gasUsed);
}
