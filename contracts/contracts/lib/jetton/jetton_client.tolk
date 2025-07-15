import "./utils.tolk"
import "../../lib/jetton/messages.tolk"

struct JettonClient {
    masterAddress: address
    jettonWalletCode: cell
}

@inline
fun JettonClient.walletAddress(self): address {
    return calculateUserJettonWalletAddress(
        contract.getAddress(),
        self.masterAddress,
        self.jettonWalletCode
    );
}

struct JettonMessageOptions {
    /// whether a message will bounce back on error
    bounce: bool
    /// message value: attached tons (or tons + extra currencies)
    value: coins | (coins, ExtraCurrenciesDict)
}

@inline
fun JettonClient.sendSimple(
    self,
    sendOptions: JettonMessageOptions,
    sendMode: int,
    queryId: uint64,
    amount: coins,
    destination: address,
    responseDestination: address,
) {
    createMessage({
        bounce: sendOptions.bounce,
        value: sendOptions.value,
        dest: self.walletAddress(),
        body: JettonTransfer {
            queryId: queryId,
            amount: amount,
            destination: destination,
            responseDestination: contract.getAddress(),
            customPayload: null,
            forwardTonAmount: 0,
            forwardPayload: beginCell().endCell().beginParse(),
        },
    })
        .send(sendMode);
}

@inline
fun JettonClient.sendExtended(
    self,
    sendOptions: JettonMessageOptions,
    sendMode: int,
    queryId: uint64,
    amount: coins,
    destination: address,
    responseDestination: address,
    customPayload: cell?,
    forwardTonAmount: coins,
    forwardPayload: slice | cell,
) {
    createMessage({
        bounce: sendOptions.bounce,
        value: sendOptions.value,
        dest: self.walletAddress(),
        body: JettonTransfer {
            queryId: queryId,
            amount: amount,
            destination: destination,
            responseDestination: responseDestination,
            customPayload: customPayload,
            forwardTonAmount: forwardTonAmount,
            forwardPayload: forwardPayload,
        },
    })
        .send(sendMode);
}
