import "@stdlib/common.tolk";
import "../../lib/jetton/messages.tolk";
import "../../lib/jetton/utils.tolk";
import "../../lib/utils.tolk";
import "../../lib/jetton/jetton_client.tolk";
// JettonSender contract in Tolk
// Allows sending jettons to other addresses

struct JettonSender {
    JettonClient: JettonClient;
}

// Send jettons fast message (basic transfer)
struct (0x6984f9bb) SendJettonsFast {
    queryId: uint64;
    amount: coins;
    destination: address;
}

// Send jettons extended message (with additional parameters)
struct (0xe815f1d0) SendJettonsExtended {
    queryId: uint64;
    amount: coins;
    destination: address;
    customPayload: cell;
    forwardTonAmount: coins;
    forwardPayload: cell;
}

type IncomingMessage = SendJettonsFast | SendJettonsExtended;

fun loadData(): JettonSender {
    return JettonSender.fromCell(contract.getData());
}

fun saveData(data: JettonSender) {
    contract.setData(data.toCell());
}

// Send basic jetton transfer
fun JettonSender.sendJettons(self, msg: SendJettonsFast) {
    // val thisContractJettonWallet = calculateTolkJettonWalletAddress(
    //     contract.getAddress(),
    //     storage.minterAddress,
    //     storage.jettonWalletCode
    // );

    // Create jetton transfer message
    // var transferMsg = beginCell();
    // transferMsg = transferMsg.storeUint(OP_TRANSFER, 32);
    // transferMsg = transferMsg.storeUint(queryId, 64);
    // transferMsg = transferMsg.storeCoins(amount);
    // transferMsg = transferMsg.storeAddress(receiver);
    // transferMsg = transferMsg.storeAddress(getAddress()); // response destination
    // transferMsg = transferMsg.storeMaybeRef(null); // custom payload
    // transferMsg = transferMsg.storeCoins(0); // forward ton amount
    // transferMsg = transferMsg.storeBool(false); // forward payload in ref?
    // // No forward payload (empty)
    
    // sendRawMessage(
    // buildInternalMessage(thisContractJettonWallet, 0, transferMsg.endCell()),
    // SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE
    // );
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
            forwardPayload: null
            }
        }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

// Send extended jetton transfer with additional parameters
fun JettonSender.sendJettonsExtended(self, msg: SendJettonsExtended) {
    // val thisContractJettonWallet = calculateTolkJettonWalletAddress(
    //     contract.getAddress(),
    //     storage.minterAddress,
    //     storage.jettonWalletCode
    // );

    // // Create jetton transfer message
    // var transferMsg = beginCell();
    // transferMsg = transferMsg.storeUint(OP_TRANSFER, 32);
    // transferMsg = transferMsg.storeUint(queryId, 64);
    // transferMsg = transferMsg.storeCoins(amount);
    // transferMsg = transferMsg.storeAddress(receiver);
    // transferMsg = transferMsg.storeAddress(getAddress()); // response destination
    // transferMsg = transferMsg.storeMaybeRef(customPayload);
    // transferMsg = transferMsg.storeCoins(forwardTonAmount);
    // transferMsg = transferMsg.storeBool(false); // forward payload inline, not in ref
    // transferMsg = transferMsg.storeSlice(forwardPayload);

    // sendRawMessage(
    //     buildInternalMessage(thisContractJettonWallet, 0, transferMsg.endCell()),
    //     SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE
    // );
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
            forwardPayload: msg.forwardPayload
            }
        }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

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
