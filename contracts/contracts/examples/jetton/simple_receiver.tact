import "../../lib/jetton/receiver.tact";

contract SimpleJettonReceiver(
    minterAddress: Address,
    jettonWalletCode: Cell,
    amountChecker: Int as coins,
    payloadChecker: Slice,
) with JettonReceiver{
    override fun handleJettonTransfer(msg: JettonNotification) {
        self.amountChecker += msg.amount;
        self.payloadChecker = msg.forwardPayload;
    }

    // deploy
    receive() {}

    // for testing
    get fun amountChecker(): Int {
        return self.amountChecker;
    }

    get fun payloadChecker(): Slice {
        return self.payloadChecker;
    }
}
