// SPDX-License-Identifier: BUSL-1.1
// Test-only harness exposing the CCT token + token-pool cost model as getters.
//
// Off-chain gas-calibration tests call these getters and compare the returned estimates against
// measured sandbox gas, so the on-chain funding assumptions and the measured Jetton costs stay in
// lockstep. This keeps a single source of truth: the constants/functions below are the exact ones
// the contracts use; tests never duplicate them or parse Tolk source.

import "@stdlib/gas-payments"

import "../../ccip/cct/fees-management"
import "../../ccip/pools/lib/token_pool/jetton_fees"
import "../../ccip/pools/lib/token_pool/budget"
import "../../ccip/pools/burn_mint/types"

contract CctCostHarness {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.test.gas.CctCostHarness"
}

fun onInternalMessage(in: InMessage) {
    assert (in.body.isEmpty()) throw 0xFFFF
}

/* === CCT wallet / minter gas constants (ccip/cct/fees-management) === */

get fun get_gasConsumptionJettonTransfer(): int { return GAS_CONSUMPTION_JettonTransfer; }
get fun get_gasConsumptionJettonReceive(): int { return GAS_CONSUMPTION_JettonReceive; }
get fun get_gasConsumptionBurnRequest(): int { return GAS_CONSUMPTION_BurnRequest; }
get fun get_gasConsumptionBurnNotification(): int { return GAS_CONSUMPTION_BurnNotification; }
get fun get_gasConsumptionMint(): int { return GAS_CONSUMPTION_Mint; }

get fun get_messageSizeBurnNotificationBits(): int { return MESSAGE_SIZE_BurnNotification_bits; }
get fun get_messageSizeBurnNotificationCells(): int { return MESSAGE_SIZE_BurnNotification_cells; }

get fun get_forwardInitStateOverhead(): coins { return forwardInitStateOverhead(); }
get fun get_jettonWalletMinStorageFee(): coins { return calculateJettonWalletMinStorageFee(); }

/// TON fee for a consumed gas amount, so tests can price measured gas with the same on-chain
/// config the budget functions use (no duplicated gas-price constant in TS).
get fun get_calculateGasFee(gasUsed: int): coins { return calculateGasFee(MY_WORKCHAIN, gasUsed); }

/* === Jetton wallet fee model (pools/lib/token_pool/jetton_fees) === */

get fun get_jettonTransferFee(fwdFee: coins, hasForward: bool, generic: bool): coins {
    val fees = generic ? JettonWalletFees.Generic : JettonWalletFees.Reference;
    return fees.transferFee(fwdFee, hasForward);
}

/* === BurnMint mint budget (pools/burn_mint/types) === */


get fun get_cctMintOpBudget(walletDeployFee: coins): coins { return cctMintOpBudget(walletDeployFee); }

/* === CCIP token-pool admission floors (ccip/budget/min_value) === */

get fun get_ccipMinValueGasUnits(): int { return TokenPool_Costs.admin(); }
get fun get_ccipAdmissionGasUnits(): int { return TokenPool_Costs.admission(); }
