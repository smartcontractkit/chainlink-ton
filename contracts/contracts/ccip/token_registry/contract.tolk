// SPDX-License-Identifier: BUSL-1.1
import "messages"
import "storage"

tolk 1.4.1

contract TokenRegistry {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.1"
    description: "link.chain.ton.ccip.TokenRegistry"

    storage: TokenRegistry_Storage
    incomingMessages: TokenRegistry_InMessage
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy TokenRegistry_InMessage.fromSlice(in.body);

    match (msg) {
        TokenRegistry_GetTokenInfo => {
            //TODO: min value assertion
            onGetTokenInfo(msg, in.senderAddress);
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

fun onGetTokenInfo(msg: TokenRegistry_GetTokenInfo, sender: address) {
    val st = TokenRegistry_Storage.load();
    var tokenPool: address? = null;
    if (st.info.enabled) {
        tokenPool = st.info.tokenPool;
    }
    val response = createMessage({
        dest: sender,
        value: 0,
        bounce: false,
        body: TokenRegistry_ReturnTokenInfo {
            minterAddress: st.info.minterAddress,
            tokenPool,
        }
    });
    response.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}
