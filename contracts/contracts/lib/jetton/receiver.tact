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

trait JettonReceiver {
    minterAddress: Address;
    jettonWalletCode: Cell;

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

    receive(msg: JettonNotification) {
        let thisContractJettonWallet = self.calculateJettonWalletAddress(
            myAddress(),
        );

        // Check if the sender is our jetton wallet, if not, reject the message
        require(sender() == thisContractJettonWallet, "Incorrect sender");

        self.handleJettonTransfer(msg);
    }

    abstract fun handleJettonTransfer(msg: JettonNotification);
}
