import "@stdlib/gas-payments"
import "../../lib/jetton/errors"

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
const MESSAGE_SIZE_Address_bits           = 267   // std address: 3+8+256

const MIN_STORAGE_DURATION = 5 * 365 * 24 * 3600  // 5 years


// Gas costs
// these constants are used to estimate gas fee (how much we should remain on balance for a swap to succeed);
// they must be absolutely equal to consumed gas; if not, tests fail;
// actual consumed gas (desired value of these constants) are printed to console after tests run

const GAS_CONSUMPTION_JettonTransfer    = 6182
const GAS_CONSUMPTION_JettonReceive     = 7481
const GAS_CONSUMPTION_BurnRequest       = 4882
const GAS_CONSUMPTION_BurnNotification  = 3915
const GAS_CONSUMPTION_Mint              = 6182


fun calculateJettonWalletMinStorageFee() {
    return calculateStorageFee(MY_WORKCHAIN, MIN_STORAGE_DURATION, STORAGE_SIZE_MaxWallet_bits, STORAGE_SIZE_MaxWallet_cells);
}

fun forwardInitStateOverhead() {
    return calculateForwardFeeWithoutLumpPrice(MY_WORKCHAIN, STORAGE_SIZE_InitStateWallet_bits, STORAGE_SIZE_InitStateWallet_cells);
}

/// The fee a transfer must cover, excluding `forwardTonAmount`. `usePrecompiledGas` must be true
/// only when called by the wallet itself; clients (pools) must pass false so they use the pinned
/// constants instead of their own precompiled gas.
fun calculateTransferFee(forwardTonAmount: int, fwdFee: int, usePrecompiledGas: bool = true): coins {
    var fwdCount = forwardTonAmount != 0 ? 2 : 1; // second sending (forward) will be cheaper that first

    var jettonWalletGasConsumption: int? = null;
    if (usePrecompiledGas) {
        jettonWalletGasConsumption = getPrecompiledGasConsumption();
    }
    var sendTransferGasConsumption = (jettonWalletGasConsumption == null) ? GAS_CONSUMPTION_JettonTransfer : jettonWalletGasConsumption!;
    var receiveTransferGasConsumption = (jettonWalletGasConsumption == null) ? GAS_CONSUMPTION_JettonReceive : jettonWalletGasConsumption!;

    return
        // 3 messages: wal1->wal2,  wal2->owner, wal2->response
        // but last one is optional (it is ok if it fails)
        fwdCount * fwdFee +
        forwardInitStateOverhead() + // additional fwd fees related to initstate in iternal_transfer
        calculateGasFee(MY_WORKCHAIN, sendTransferGasConsumption) +
        calculateGasFee(MY_WORKCHAIN, receiveTransferGasConsumption) +
        calculateJettonWalletMinStorageFee();
}

fun checkAmountIsEnoughToTransfer(msgValue: int, forwardTonAmount: int, fwdFee: int, usePrecompiledGas: bool = true) {
    assert (msgValue >
        forwardTonAmount + calculateTransferFee(forwardTonAmount, fwdFee, usePrecompiledGas)
    ) throw ERROR_NOT_ENOUGH_GAS;
}

/// The value a burn must carry to fund the wallet, the minter's notification and, when
/// `hasExcesses`, the minter's `ReturnExcessesBack`. Both outgoing messages carry the request's
/// `forwardPayload`, so the incoming forward fee (plus the burn initiator address the notification
/// adds) bounds each of them, as in `checkAmountIsEnoughToTransfer`.
fun calculateBurnRequiredValue(fwdFee: int, hasExcesses: bool, usePrecompiledGas: bool = true): coins {
    var jettonWalletGasConsumption: int? = null;
    if (usePrecompiledGas) {
        jettonWalletGasConsumption = getPrecompiledGasConsumption();
    }
    var sendBurnGasConsumption = (jettonWalletGasConsumption == null) ? GAS_CONSUMPTION_BurnRequest : jettonWalletGasConsumption!;

    val payloadFee = fwdFee + calculateForwardFeeWithoutLumpPrice(MY_WORKCHAIN, MESSAGE_SIZE_Address_bits, 0);
    val messageFee = max(payloadFee, calculateForwardFee(MY_WORKCHAIN, MESSAGE_SIZE_BurnNotification_bits, MESSAGE_SIZE_BurnNotification_cells));
    val fwdCount = hasExcesses ? 2 : 1;

    return fwdCount * messageFee +
        calculateGasFee(MY_WORKCHAIN, sendBurnGasConsumption) +
        calculateGasFee(MY_WORKCHAIN, GAS_CONSUMPTION_BurnNotification);
}

/// An underfunded burn is rejected here, before supply changes, instead of committing and dropping
/// the excess that completes the operation.
fun checkAmountIsEnoughToBurn(msgValue: int, fwdFee: int, hasExcesses: bool, usePrecompiledGas: bool = true) {
    assert (msgValue > calculateBurnRequiredValue(fwdFee, hasExcesses, usePrecompiledGas)) throw ERROR_NOT_ENOUGH_GAS;
}
