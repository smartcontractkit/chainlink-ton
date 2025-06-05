import "../../lib/jetton/receiver.tact";

contract OnrampMock(
    minterAddress: Address,
    jettonWalletCode: Cell,
) with JettonReceiver{
    override fun handleJettonTransfer(msg: JettonNotification) {
        dump("hey");
    }

    // deploy
    receive() {}
}
