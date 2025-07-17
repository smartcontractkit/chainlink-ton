import "@stdlib/common.tolk"
import "../../lib/jetton/jetton_client.tolk"
import "../../lib/jetton/messages.tolk"

// SimpleJettonReceiver contract in Tolk
// Simple receiver that just tracks amounts and payloads
const INCORRECT_SENDER_ERROR = 100

struct SimpleJettonReceiver {
    JettonClient: JettonClient
    amountChecker: coins
    payloadChecker: cell?
}

fun SimpleJettonReceiver.load(): SimpleJettonReceiver {
    return SimpleJettonReceiver.fromCell(contract.getData());
}

fun SimpleJettonReceiver.store(self) {
    contract.setData(self.toCell());
}

type IncomingMessage = TransferNotificationForRecipient

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        // ignore all empty messages
        return;
    }

    val msg = IncomingMessage.fromSlice(in.body);

    var this = SimpleJettonReceiver.load();

    match (msg) {
        TransferNotificationForRecipient => {
            this.handleJettonTransferNotification(msg, in.senderAddress);
        }
    }
}

fun JettonReceiver.handleJettonTransferNotification(
    mutate self,
    msg: TransferNotificationForRecipient,
    sender: address,
) {
    // Check if the sender is our jetton wallet
    assert (self.JettonClient.isWallet(sender)) throw INCORRECT_SENDER_ERROR;

    // Handle the jetton transfer - simple implementation just updates trackers
    self.amountChecker += msg.jettonAmount;
    self.payloadChecker = loadMaybeForwardPayloadAsCell(msg.forwardPayload);
}

get fun amountChecker(): coins {
    val this = SimpleJettonReceiver.load();
    return this.amountChecker;
}

get fun payloadChecker(): cell? {
    val this = SimpleJettonReceiver.load();
    return this.payloadChecker;
}
