import "messages"
import "storage"
import "../../lib/jetton/jetton_client"
import "../../lib/jetton/utils"

tolk 1.0;

fun onInternalMessage(in: InMessage) {
    val msg = lazy TokenRegistry_InMessage.fromSlice(in.body);

    match (msg) {
        TokenRegistry_SetInfo => {
            var st = TokenRegistry_Storage.load();
            TokenRegistry{
                data: TokenRegistry_InitializedStorage {
                    onramp: st.onramp,
                    minterAddress: st.minterAddress,
                    info: msg.info,
                },
            }.store();
        }
        TokenRegistry_GetTokenInfo => {
            val this = TokenRegistry.load();
            this.handleGetTokenInfo(msg, in.senderAddress);
        }
        else => {
            assert (in.body.isEmpty()) throw 10; // TODO propper error
        }
    }
}

struct TokenRegistry {
    data: TokenRegistry_InitializedStorage
}

fun TokenRegistry.load(): TokenRegistry {
    return TokenRegistry {
        data: TokenRegistry_InitializedStorage.load()
    };
}

fun TokenRegistry.store(self) {
    return self.data.store();
}

fun TokenRegistry.handleGetTokenInfo(self, msg: TokenRegistry_GetTokenInfo, sender: address) {
    if (!self.data.info.enabled) {
        // TODO: send message blocking transaction
        debug.printString("TokenRegistry: Registry is disabled");
        throw 501;
        return;
    }

    if (msg.executorJettonWallet != calculateUserJettonWalletAddress(
        sender,
        self.data.minterAddress,
        self.data.info.walletCode,
    )) {
        // TODO: Send message blocking transaction
        debug.printString("TokenRegistry: Invalid executor jetton wallet");
        throw 502;
        return;
    }

    val response = createMessage({
        dest: sender,
        value: 0,
        bounce: true,
        body: TokenRegistry_TokenPoolInfo {
            queryId: msg.queryId,
            tokenPool: self.data.info.tokenPool,
        }
    });
    response.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}