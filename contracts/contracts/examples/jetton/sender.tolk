import "@stdlib/common.tolk"
import "../../lib/jetton/jetton_client.tolk"

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

fun JettonSender.load(): JettonSender {
    return JettonSender.fromCell(contract.getData());
}

fun JettonSender.store(self) {
    contract.setData(self.toCell());
}

// Send basic jetton transfer
fun JettonSender.sendJettons(self, msg: SendJettonsFast) {
    self.JettonClient.sendSimple(
        { bounce: true, value: 0 },
        SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE,
        msg.queryId,
        msg.amount,
        msg.destination,
        contract.getAddress()
    );
}

// Send extended jetton transfer with additional parameters
fun JettonSender.sendJettonsExtended(self, msg: SendJettonsExtended) {
    self.JettonClient.sendExtended(
        { bounce: true, value: 0 },
        SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE,
        msg.queryId,
        msg.amount,
        msg.destination,
        contract.getAddress(),
        msg.customPayload,
        msg.forwardTonAmount,
        msg.forwardPayload
    );
}

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        // ignore all empty messages
        return;
    }

    val msg = IncomingMessage.fromSlice(in.body);
    var this = JettonSender.load();

    match (msg) {
        SendJettonsFast => {
            this.sendJettons(msg);
        }
        SendJettonsExtended => {
            this.sendJettonsExtended(msg);
        }
    }
}
