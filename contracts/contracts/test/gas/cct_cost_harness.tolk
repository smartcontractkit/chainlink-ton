// SPDX-License-Identifier: BUSL-1.1
// Test-only harness exposing the CCT token + token-pool cost model as getters.
//
// Off-chain gas-calibration tests call these getters and compare the returned estimates against
// measured sandbox gas, so the on-chain funding assumptions and the measured Jetton costs stay in
// lockstep. This keeps a single source of truth: the constants/functions below are the exact ones
// the contracts use; tests never duplicate them or parse Tolk source.

import "@stdlib/gas-payments"

import "../../ccip/cct/fees-management"
import "../../ccip/pools/lib/token_pool/recovery"
import "../../ccip/pools/burn_mint/types"
import "../../ccip/budget/min_value"
import "../../lib/budget/gas"

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

/* === Token-pool transfer budget (pools/lib/token_pool/recovery) === */

get fun get_jettonTransferBufferPct(): int { return JETTON_TRANSFER_VALUE_BUFFER_PCT; }
get fun get_tokenPoolReturnTransferValue(): coins { return TokenPool_RETURN_TRANSFER_VALUE; }

get fun get_jettonTransferOpBudget(fwdFee: coins, hasForward: bool): coins {
    return jettonTransferOpBudget(fwdFee, hasForward);
}

get fun get_jettonTransferValue(forwardTonAmount: coins, fwdFee: coins): coins {
    return jettonTransferValue(forwardTonAmount, fwdFee);
}

get fun get_jettonTransferForwardValue(available: coins, fwdFee: coins, bufferPct: int): coins {
    return jettonTransferForwardValue(available, fwdFee, bufferPct);
}

/* === BurnMint mint budget (pools/burn_mint/types) === */

get fun get_cctTransferBufferPct(): int { return CCT_TRANSFER_BUFFER_PCT; }

get fun get_cctMintOpBudget(walletDeployFee: coins): coins { return cctMintOpBudget(walletDeployFee); }

/* === CCIP token-pool admission floors (ccip/budget/min_value) === */

get fun get_ccipMinValueGasUnits(): int { return CCIP_MIN_VALUE_GAS_UNITS; }
get fun get_ccipAdmissionGasUnits(): int { return CCIP_ADMISSION_GAS_UNITS; }
