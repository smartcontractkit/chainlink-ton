import "@stdlib/common.tolk";
import "../../lib/jetton/messages.tolk";
import "../../lib/jetton/utils.tolk";
import "../../lib/utils.tolk";
import "../../lib/jetton/jetton_client.tolk";

// JettonReceiver contract in Tolk
// Base receiver that verifies sender and tracks amounts/payloads
const INCORRECT_SENDER_ERROR = 100;

struct JettonReceiver {
    JettonClient: JettonClient;
    amountChecker: coins;
    payloadChecker: slice;
}

fun loadData(): JettonReceiver {
    return JettonReceiver.fromCell(contract.getData());
}

fun JettonReceiver.saveData(self) {
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
    // Check if the sender is our jetton wallet, if not, reject the message
    assert(sender == self.JettonClient.walletAddress(), INCORRECT_SENDER_ERROR);

    // Handle incoming jetton transfer as needed by your contract logic
    // You can add your own logic here, such as updating balances or triggering events
    self.amountChecker += msg.amount;
    self.payloadChecker = msg.forwardPayload;

    self.saveData();
}

// For testing
get amountChecker(): coins {
    val this = loadData();
    return this.amountChecker;
}

get payloadChecker(): slice {
    val this = loadData();
    return this.payloadChecker;
}
