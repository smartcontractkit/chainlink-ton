import "@stdlib/gas-payments"
import "../../../../lib/utils"
import "../../../../lib/jetton/messages"

/// Fixed wallet budget for best-effort custody returns; never reduced on underfunded input.
const TokenPool_RETURN_TRANSFER_VALUE = grams("0.1");

/// Queues a return only when inbound value covers its full wallet budget and recovery costs.
/// The caller must reserve before refund logs, return attempts, or replies.
/// An optional failure reply has priority: its forwarding and execution budget is protected.
/// A true result means queued, not confirmed by the wallet.
fun sendTokenPoolRecoveryReturn(
    msgValue: coins,
    wallet: address,
    transfer: AskToTransfer,
    failure: OutMessage? = null,
): bool {
    val value = TokenPool_RETURN_TRANSFER_VALUE + transfer.forwardTonAmount;
    val returnMsg = createMessage({
        bounce: BounceMode.NoBounce,
        value,
        dest: wallet,
        body: transfer,
    });
    val workchain = contract.getAddress().getWorkchain();
    val computeFee = calculateGasFee(workchain, getGasConsumedAtTheMoment() + DEFAULT_MESSAGE_FWD_BUDGET_GAS_UNITS);
    val replyBudget = failure != null
        ? failure.estimateFeeWithoutSending(SEND_MODE_REGULAR) + calculateGasFeeFor(FEE_SIZE_LARGE)
        : 0 as coins;
    val requiredValue = value + returnMsg.estimateFeeWithoutSending(SEND_MODE_PAY_FEES_SEPARATELY)
        + computeFee + contract.getStorageDuePayment() + replyBudget;
    if (msgValue <= requiredValue) {
        return false;
    }
    returnMsg.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS);
    return true;
}