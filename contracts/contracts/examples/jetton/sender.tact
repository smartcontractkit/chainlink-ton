import "../../jetton/basic/messages.tact";

/// Struct that represents Tact Jetton Wallet state init. It's used to calculate the address of the Jetton Wallet
///
/// Different Jettons implementations may have different state init structures. For example, Governance Jetton Wallet (USDT)
/// has this:
/// ```tact
/// struct GovernanceJettonWalletStateInit {
///     status: Int as uint4 = 0,
///     balance: Int as coins = 0,
///     owner: Address,
///     master: Address,
/// }
/// ```
struct TactJettonWalletStateInit {
    balance: Int as coins = 0;
    owner: Address;
    minter: Address;
}

/// Message that represents a request to send jettons. Contains the amount of jettons to send and the destination address.
message(0x6984f9bb) SendJettonsFast {
    queryId: Int as uint64;
    amount: Int as coins;
    destination: Address;
}

/// Message that represents a request to send jettons with additional parameters.
message(0xe815f1d0) SendJettonsExtended {
    queryId: Int as uint64;
    amount: Int as coins;
    destination: Address;
    customPayload: Cell;
    forwardTonAmount: Int as coins;
    forwardPayload: Slice as remaining;
}

contract JettonSender(
    minterAddress: Address,
    jettonWalletCode: Cell,
) {
    inline fun getTactJettonWalletStateInit(owner: Address): Cell {
        return TactJettonWalletStateInit {
            owner,
            minter: self.minterAddress,
        }.toCell();
    }

    inline fun calculateJettonWalletAddress(owner: Address): Address {
        let initData = self.getTactJettonWalletStateInit(owner);
        return contractAddress(StateInit { code: self.jettonWalletCode, data: initData });
    }

    /// To send jettons, we need to send a message to our Jetton Wallet contract.
    fun sendJettons(queryId: Int, receiver: Address, amount: Int) {
        let thisContractJettonWallet = self.calculateJettonWalletAddress(
            myAddress(),
        );

        message(MessageParameters {
            to: thisContractJettonWallet,
            value: 0,
            body: JettonTransfer {
                queryId,
                amount,
                destination: receiver,
                responseDestination: myAddress(),
                customPayload: null,
                forwardTonAmount: 0,
                forwardPayload: beginCell().storeMaybeRef(null).asSlice(),
            }.toCell(),
            mode: SendRemainingValue,
        });
    }

    fun sendJettonsExtended(queryId: Int, receiver: Address, amount: Int, forwardTonAmount: Int, forwardPayload: Slice, customPayload: Cell?) {
        let thisContractJettonWallet = self.calculateJettonWalletAddress(
            myAddress(),
        );

        message(MessageParameters {
            to: thisContractJettonWallet,
            value: 0,
            body: JettonTransfer {
                queryId,
                amount,
                destination: receiver,
                responseDestination: myAddress(),
                customPayload,
                forwardTonAmount,
                forwardPayload,
            }.toCell(),
            mode: SendRemainingValue,
        });
    }

    receive(msg: SendJettonsFast) {
        self.sendJettons(msg.queryId, msg.destination, msg.amount);
    }

    receive(msg: SendJettonsExtended) {
        self.sendJettonsExtended(
            msg.queryId,
            msg.destination,
            msg.amount,
            msg.forwardTonAmount,
            msg.forwardPayload,
            msg.customPayload,
        );
    }

    // deploy
    receive() {}
}
