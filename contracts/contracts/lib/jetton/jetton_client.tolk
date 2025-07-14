import "./utils.tolk";

struct JettonClient {
    masterAddress: address;
    jettonWalletCode: cell;
}

fun JettonWallet.walletAddress(self): address {
    return calculateUserJettonWalletAddress(
        contract.getAddress(),
        self.masterAddress,
        self.jettonWalletCode
    );
}