import "../../lib/jetton/receiver.tact";
import "../../jetton/basic/messages";

const FEE: Int = 5;

struct InsufficientFee {
    queryId: Int as uint64;
    sender: Address;
}

struct AcceptedRequest {
    queryId: Int as uint64;
    sender: Address;
    payload: Slice as remaining;
}

contract OnrampMock(
    minterAddress: Address,
    jettonWalletCode: Cell,
) with JettonReceiver {
    override fun handleJettonTransfer(msg: JettonNotification) {
        if (msg.amount < FEE) {
            emit(InsufficientFee {
                queryId: msg.queryId,
                sender: msg.sender,
            }.toCell());
        } else {
            emit(AcceptedRequest {
                queryId: msg.queryId,
                sender: msg.sender,
                payload: msg.forwardPayload,
            }.toCell());
            // emit(msg.toCell());
        }
    }

    // deploy
    receive() {}
}
