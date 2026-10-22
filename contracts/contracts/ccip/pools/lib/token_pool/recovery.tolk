import "@stdlib/gas-payments"

import "../../../../lib/budget/gas"
import "../../../../lib/jetton/messages"
import "jetton_fees"

/// Gas a recovery still runs after its funding check: sending the return and the failure reply.
const TokenPool_RECOVERY_SENDS_GAS_UNITS = BUDGET_UNITS_LVL0_MIN;

/// What this recovery transaction costs the pool: the gas used so far, the sends that follow and
/// the storage due.
fun recoveryTransactionCost(): coins {
    val gasUnits = getGasConsumedAtTheMoment() + TokenPool_RECOVERY_SENDS_GAS_UNITS;
    return calculateGasFee(contract.getAddress().getWorkchain(), gasUnits) + contract.getStorageDuePayment();
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
    // Returns go through any wallet, so budget generously.
    val value = JettonWalletFees.Generic.transferValue(transfer.forwardTonAmount, fwdFee);
    // The failure reply (sent by the caller after this return) is funded from what is left.
    val replyBudget = failure != null
        ? failure.estimateFeeWithoutSending(SEND_MODE_REGULAR) + calculateGasFeeFor(FEE_SIZE_LARGE)
        : 0 as coins;
    if (msgValue <= value + fwdFee + recoveryTransactionCost() + replyBudget) {
        return false;
    }
    returnOpts.value = value;
    createMessage(returnOpts).send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS);
    return true;
}
