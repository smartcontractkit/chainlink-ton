import "@stdlib/common.tolk"
import "../../lib/jetton/jetton_client.tolk"
import "../../lib/jetton/messages.tolk"
import "../../lib/jetton/utils.tolk"
import "../../lib/utils.tolk"

// OnrampMock contract in Tolk
// Mock onramp that accepts jetton transfers if they meet the fee requirement
const FEE = 5

const INCORRECT_SENDER_ERROR = 100
const FORWARD_PAYLOAD_REQUIRED_ERROR = 101

struct OnrampMock {
    JettonClient: JettonClient
}

// Event emitted when fee is insufficient
struct InsufficientFee {
    queryId: uint64
    sender: address
}

// Event emitted when request is accepted
struct AcceptedRequest {
    queryId: uint64
    sender: address
    payload: cell
}

fun OnrampMock.load(): OnrampMock {
    return OnrampMock.fromCell(contract.getData());
}

fun OnrampMock.store(data: OnrampMock) {
    contract.setData(data.toCell());
}

fun OnrampMock.handleJettonTransferNotification(
    mutate self,
    msg: JettonNotification,
    sender: address,
) {
    // Check if the sender is our jetton wallet
    assert(sender == self.JettonClient.walletAddress(), INCORRECT_SENDER_ERROR);

    assert(msg.forwardPayload != null, FORWARD_PAYLOAD_REQUIRED_ERROR);

    // Handle the jetton transfer
    if (msg.amount < FEE) {
        emit(JETTON_TOPIC, InsufficientFee { queryId: msg.queryId, sender: sender });
    } else {
        emit(
            JETTON_TOPIC,
            AcceptedRequest {
                queryId: msg.queryId,
                sender: sender,
                payload: msg.forwardPayload!,
            }
        );
    }
}

type IncomingMessage = JettonNotification

fun onInternalMessage(in: InMessage) {
    val msg = lazy IncomingMessage.fromSlice(in.body);

    var this = OnrampMock.load();

    // Check if this is a jetton notification  
    match (msg) {
        JettonNotification => {
            this.handleJettonTransferNotification(msg, in.senderAddress);
        }
        else => {
            // ignore empty messages, "wrong opcode" for others  
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
}
