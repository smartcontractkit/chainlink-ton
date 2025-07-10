import "@stdlib/common.tolk";
import "../../lib/jetton/messages.tolk";
import "../../lib/jetton/utils.tolk";
import "../../lib/utils.tolk";
import "../../lib/jetton/jetton_client.tolk";

// SimpleJettonReceiver contract in Tolk
// Simple receiver that just tracks amounts and payloads
const INCORRECT_SENDER_ERROR = 100;

struct SimpleJettonReceiver {
    JettonClient: JettonClient;
    amountChecker: coins;
    payloadChecker: cell?;
}

fun loadData(): SimpleJettonReceiver {
    return SimpleJettonReceiver.fromCell(contract.getData());
}

fun SimpleJettonReceiver.saveData(self) {
    contract.setData(self.toCell());
}

type IncomingMessage = JettonNotification;

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) { // ignore all empty messages
        return;
    }

    val msg = IncomingMessage.fromSlice(in.body);

    var this = loadData();

    match (msg) {
        JettonNotification => { 
            this.handleJettonTransferNotification(msg, in.senderAddress);
        }
    }
}

fun JettonReceiver.handleJettonTransferNotification(mutate self, msg: JettonNotification, sender: address) {
    // Check if the sender is our jetton wallet
    assert(sender == self.JettonClient.walletAddress(), INCORRECT_SENDER_ERROR);

    // Handle the jetton transfer - simple implementation just updates trackers
    self.amountChecker += msg.amount;
    self.payloadChecker = msg.forwardPayload;

    self.saveData();
}

get fun amountChecker(): coins {
    val this = loadData();
    return this.amountChecker;
}

get fun payloadChecker(): cell? {
    val this = loadData();
    return this.payloadChecker;
}
