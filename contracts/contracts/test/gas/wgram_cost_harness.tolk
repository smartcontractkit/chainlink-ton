// SPDX-License-Identifier: BUSL-1.1
// Test-only harness exposing the wGRAM wallet / minter cost model as getters.
//
// Mirrors cct_cost_harness.tolk for the wGRAM token: off-chain gas-calibration tests compare the
// returned estimates against measured sandbox gas. wGRAM and CCT each define their own
// GAS_CONSUMPTION_* / MESSAGE_SIZE_* constants, so they need separate harness contracts (Tolk has
// no import namespacing).

import "@stdlib/gas-payments"

import "../../wgram/fees-management"

contract WgramCostHarness {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.test.gas.WgramCostHarness"
}

fun onInternalMessage(in: InMessage) {
    assert (in.body.isEmpty()) throw 0xFFFF
}

/* === wGRAM wallet / minter gas constants (wgram/fees-management) === */

get fun get_gasConsumptionJettonTransfer(): int { return GAS_CONSUMPTION_JettonTransfer; }
get fun get_gasConsumptionJettonReceive(): int { return GAS_CONSUMPTION_JettonReceive; }
get fun get_gasConsumptionBurnRequest(): int { return GAS_CONSUMPTION_BurnRequest; }
get fun get_gasConsumptionBurnNotification(): int { return GAS_CONSUMPTION_BurnNotification; }

get fun get_messageSizeBurnNotificationBits(): int { return MESSAGE_SIZE_BurnNotification_bits; }
get fun get_messageSizeBurnNotificationCells(): int { return MESSAGE_SIZE_BurnNotification_cells; }
get fun get_messageSizeReturnExcessesBits(): int { return MESSAGE_SIZE_ReturnExcesses_bits; }
get fun get_messageSizeReturnExcessesCells(): int { return MESSAGE_SIZE_ReturnExcesses_cells; }

get fun get_forwardInitStateOverhead(): coins { return forwardInitStateOverhead(); }
get fun get_jettonWalletMinStorageFee(): coins { return calculateJettonWalletMinStorageFee(); }
