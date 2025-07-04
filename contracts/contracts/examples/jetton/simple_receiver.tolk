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

fun onInternalMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    if (msgBody.isEnd()) { // ignore all empty messages
        return;
    }

    var cs = msgFull.beginParse();
    val flags = cs.loadMessageFlags();
    if (isMessageBounced(flags)) { // ignore all bounced messages
        return;
    }

    val msg = IncomingMessage.fromSlice(msgBody);

    val sender = cs.loadAddress();
    var this = loadData();

        match (msg) {
        JettonNotification => { 
            this.handleJettonTransferNotification(msg, sender);
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

get amountChecker(): coins {
    val this = loadData();
    return this.amountChecker;
}

get payloadChecker(): cell? {
    val this = loadData();
    return this.payloadChecker;
}
