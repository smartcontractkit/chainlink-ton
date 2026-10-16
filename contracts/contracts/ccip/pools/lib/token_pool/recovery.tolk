import "@stdlib/gas-payments"

import "../../../../lib/budget/gas"
import "../../../../lib/jetton/messages"
import "../../../cct/fees-management"

/// Additional custody-return allowance protected by the lock/deposit admission check.
const TokenPool_RETURN_TRANSFER_VALUE = grams("0.1");

/// Extra headroom for wallets other than the reference CCT implementation.
const JETTON_TRANSFER_VALUE_BUFFER_PCT = 200; // 2x

/// Part of the inbound value this entrypoint keeps to finish its own work: the gas already
/// consumed plus a forward budget for the rest of the transaction, and the storage due.
fun tokenPoolEntrypointCost(): coins {
    val workchain = contract.getAddress().getWorkchain();
    return calculateGasFee(workchain, getGasConsumedAtTheMoment() + DEFAULT_MESSAGE_FWD_BUDGET_GAS_UNITS)
        + contract.getStorageDuePayment();
}

/// Fixed cost of a jetton transfer — the right-hand side of the wallet's
/// `checkAmountIsEnoughToTransfer` minus the forwarded amount: forwarding fees, init-state
/// overhead, and the sending/receiving wallets' gas and storage. `hasForward` includes the
/// notification's forwarding fee as well as the wallet-to-wallet message fee.
/// @dev Mirrors `ccip/cct/fees-management.checkAmountIsEnoughToTransfer`; the reference gas
///      constants are imported, not duplicated.
fun jettonTransferOpBudget(fwdFee: coins, hasForward: bool): coins {
    val fwdCount = hasForward ? 2 : 1;
    return fwdCount * fwdFee
        + forwardInitStateOverhead()
        + calculateGasFee(MY_WORKCHAIN, GAS_CONSUMPTION_JettonTransfer)
        + calculateGasFee(MY_WORKCHAIN, GAS_CONSUMPTION_JettonReceive)
        + calculateJettonWalletMinStorageFee();
}

/// Fixed transfer allowance for recovery. Buffer the wallet costs, not the value promised to the
/// notification recipient. The extra nanoton satisfies the reference wallet's strict `>` check.
fun jettonTransferValue(forwardTonAmount: coins, fwdFee: coins): coins {
    return forwardTonAmount + jettonTransferOpBudget(fwdFee, forwardTonAmount != 0)
        * JETTON_TRANSFER_VALUE_BUFFER_PCT / 100 + 1;
}

/// Dynamic continuation value: everything left after the buffered transfer costs. Zero means
/// there is no funded notification; the caller decides whether to unwind or omit it.
fun jettonTransferForwardValue(
    available: coins,
    fwdFee: coins,
    bufferPct: int = JETTON_TRANSFER_VALUE_BUFFER_PCT,
): coins {
    return max(0, available - jettonTransferOpBudget(fwdFee, true) * bufferPct / 100 - 1);
}

/// Queues a return only when inbound value covers its full transfer cost and recovery costs.
/// The caller must reserve before refund logs, return attempts, or replies.
/// An optional failure reply has priority: its forwarding and execution budget is protected.
/// A true result means queued, not confirmed by the wallet.
fun sendTokenPoolRecoveryReturn(
    msgValue: coins,
    wallet: address,
    transfer: AskToTransfer,
    failure: OutMessage? = null,
): bool {
    // A funded return cannot exceed msgValue; quote that upper bound before reducing it.
    var returnOpts = CreateMessageOptions<AskToTransfer> {
        bounce: BounceMode.NoBounce,
        value: msgValue,
        dest: wallet,
        body: transfer,
    };
    val fwdFee = createMessage(returnOpts).estimateFeeWithoutSending(SEND_MODE_PAY_FEES_SEPARATELY);
    val value = jettonTransferValue(transfer.forwardTonAmount, fwdFee);
    // The failure reply (sent by the caller after this return) is funded from what is left.
    val replyBudget = failure != null
        ? failure.estimateFeeWithoutSending(SEND_MODE_REGULAR) + calculateGasFeeFor(FEE_SIZE_LARGE)
        : 0 as coins;
    if (msgValue <= value + fwdFee + tokenPoolEntrypointCost() + replyBudget) {
        return false;
    }
    returnOpts.value = value;
    createMessage(returnOpts).send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS);
    return true;
}
