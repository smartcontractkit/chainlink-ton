// SPDX-License-Identifier: MIT
// Imported from https://github.com/ton-blockchain/tolk-bench/blob/0f416ca611fbfa25e736973d01e5fb70af485468/contracts_Tolk/03_notcoin/fees-management.tolk
import "@stdlib/gas-payments"
import "../lib/jetton/errors"

// we're working in basechain, but theoretically, a jetton might even work in masterchain
const MY_WORKCHAIN = BASECHAIN

fun getPrecompiledGasConsumption(): int?
    asm "GETPRECOMPILEDGAS"

// Storage costs
// these constants are used to estimate storage fee (how much we should pay for storing a wallet contract)

const STORAGE_SIZE_MaxWallet_bits         = 1033
const STORAGE_SIZE_MaxWallet_cells        = 3
const STORAGE_SIZE_InitStateWallet_bits   = 931
const STORAGE_SIZE_InitStateWallet_cells  = 3

const MESSAGE_SIZE_BurnNotification_bits  = 754   // body = 32+64+124+(3+8+256)+(3+8+256)
const MESSAGE_SIZE_BurnNotification_cells = 1     // body always in ref
const MESSAGE_SIZE_ReturnExcesses_bits    = 96    // body = 32+64
const MESSAGE_SIZE_ReturnExcesses_cells   = 1     // body fits in a single cell

const MIN_STORAGE_DURATION = 5 * 365 * 24 * 3600  // 5 years


// Gas costs
// these constants are used to estimate gas fee (how much we should remain on balance for a swap to succeed);
// they must stay exactly equal to the calibrated measured gas values for the covered live paths;
// if those measured values drift, tests fail.
// actual consumed gas is measured by tests/gas-report/wton/Wton.spec.ts via yarn wton-gas-report
// GAS_CONSUMPTION_JettonTransfer is calibrated against the max sender-side path that reuses
// checkAmountIsEnoughToTransfer (wallet transfer sender vs mint sender candidate).
// GAS_CONSUMPTION_JettonReceive is calibrated against the max live receive branch with both
// recipient notification and excess handling enabled.

const GAS_CONSUMPTION_JettonTransfer    = 7332
const GAS_CONSUMPTION_JettonReceive     = 7592
const GAS_CONSUMPTION_BurnRequest       = 5613
const GAS_CONSUMPTION_BurnNotification  = 4558


fun calculateJettonWalletMinStorageFee() {
    return calculateStorageFee(MY_WORKCHAIN, MIN_STORAGE_DURATION, STORAGE_SIZE_MaxWallet_bits, STORAGE_SIZE_MaxWallet_cells);
}

fun forwardInitStateOverhead() {
    return calculateForwardFeeWithoutLumpPrice(MY_WORKCHAIN, STORAGE_SIZE_InitStateWallet_bits, STORAGE_SIZE_InitStateWallet_cells);
}

fun checkAmountIsEnoughToTransfer(msgValue: int, forwardTonAmount: int, fwdFee: int) {
    var fwdCount = forwardTonAmount != 0 ? 2 : 1; // second sending (forward) will be cheaper than first

    var jettonWalletGasConsumption = getPrecompiledGasConsumption();
    var sendTransferGasConsumption = (jettonWalletGasConsumption == null) ? GAS_CONSUMPTION_JettonTransfer : jettonWalletGasConsumption;
    var receiveTransferGasConsumption = (jettonWalletGasConsumption == null) ? GAS_CONSUMPTION_JettonReceive : jettonWalletGasConsumption;

    assert (msgValue >
        forwardTonAmount +
        // 3 messages: wal1->wal2,  wal2->owner, wal2->response
        // but last one is optional (it is ok if it fails)
        fwdCount * fwdFee +
        forwardInitStateOverhead() + // additional fwd fees related to initstate in internal_transfer
        calculateGasFee(MY_WORKCHAIN, sendTransferGasConsumption) +
        calculateGasFee(MY_WORKCHAIN, receiveTransferGasConsumption) +
        calculateJettonWalletMinStorageFee()
    ) throw ERROR_NOT_ENOUGH_GAS;
}

fun checkAmountIsEnoughToMint(msgValue: int, jettonAmount: int, tonAmount: int, fwdFee: int) {
    // Mint sends InternalTransferStep with PAY_FEES_SEPARATELY, so the caller must fund
    // both the hosted TON/backing value and the minter's own outbound auto-deploy fee.
    assert (msgValue >
        jettonAmount +
        tonAmount +
        fwdFee +
        forwardInitStateOverhead() // additional fwd fees related to initstate in internal_transfer
    ) throw ERROR_NOT_ENOUGH_GAS;
}

fun checkAmountIsEnoughToBurn(msgValue: int) {
    var jettonWalletGasConsumption = getPrecompiledGasConsumption();
    var sendBurnGasConsumption = (jettonWalletGasConsumption == null) ? GAS_CONSUMPTION_BurnRequest : jettonWalletGasConsumption;

    assert (msgValue >
        calculateForwardFee(MY_WORKCHAIN, MESSAGE_SIZE_BurnNotification_bits, MESSAGE_SIZE_BurnNotification_cells) +
        // The burn sender must also budget the minter's final ReturnExcessesBack payout send.
        // Without this extra forward fee, a tiny burn can succeed while sender-side payout costs
        // shave the delivered principal before the payout even reaches the recipient.
        calculateForwardFee(MY_WORKCHAIN, MESSAGE_SIZE_ReturnExcesses_bits, MESSAGE_SIZE_ReturnExcesses_cells) +
        calculateGasFee(MY_WORKCHAIN, sendBurnGasConsumption) +
        calculateGasFee(MY_WORKCHAIN, GAS_CONSUMPTION_BurnNotification)
    ) throw ERROR_NOT_ENOUGH_GAS;
}
