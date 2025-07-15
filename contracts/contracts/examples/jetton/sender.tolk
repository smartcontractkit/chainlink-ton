import "@stdlib/common.tolk"
import "../../lib/jetton/jetton_client.tolk"
import "../../lib/jetton/messages.tolk"
import "../../lib/jetton/utils.tolk"
import "../../lib/utils.tolk"

// JettonSender contract in Tolk
// Allows sending jettons to other addresses
struct JettonSender {
    JettonClient: JettonClient
}

// Send jettons fast message (basic transfer)
struct (0x6984f9bb) SendJettonsFast {
    queryId: uint64
    amount: coins
    destination: address
}

// Send jettons extended message (with additional parameters)
struct (0xe815f1d0) SendJettonsExtended {
    queryId: uint64
    amount: coins
    destination: address
    customPayload: cell
    forwardTonAmount: coins
    forwardPayload: cell
}

type IncomingMessage = SendJettonsFast | SendJettonsExtended

fun loadData(): JettonSender {
    return JettonSender.fromCell(contract.getData());
}

fun saveData(data: JettonSender) {
    contract.setData(data.toCell());
}

// Send basic jetton transfer
fun JettonSender.sendJettons(self, msg: SendJettonsFast) {
    createMessage({
        bounce: true,
        value: 0,
        dest: self.JettonClient.walletAddress(),
        body: JettonTransfer {
            queryId: msg.queryId,
            amount: msg.amount,
            destination: msg.destination,
            responseDestination: contract.getAddress(),
            customPayload: null,
            forwardTonAmount: 0,
            forwardPayload: null,
        },
    })
        .send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

// Send extended jetton transfer with additional parameters
fun JettonSender.sendJettonsExtended(self, msg: SendJettonsExtended) {
    createMessage({
        bounce: true,
        value: 0,
        dest: self.JettonClient.walletAddress(),
        body: JettonTransfer {
            queryId: msg.queryId,
            amount: msg.amount,
            destination: msg.destination,
            responseDestination: contract.getAddress(),
            customPayload: msg.customPayload,
            forwardTonAmount: msg.forwardTonAmount,
            forwardPayload: msg.forwardPayload,
        },
    })
        .send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        // ignore all empty messages
        return;
    }

    val msg = IncomingMessage.fromSlice(in.body);
    var this = loadData();

    match (msg) {
        SendJettonsFast => {
            this.sendJettons(msg);
        }
        SendJettonsExtended => {
            this.sendJettonsExtended(msg);
        }
    }
}
