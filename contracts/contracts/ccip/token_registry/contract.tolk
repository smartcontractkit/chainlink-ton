// SPDX-License-Identifier: BUSL-1.1
import "messages"
import "storage"

tolk 1.4.1

contract TokenRegistry {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.0"
    description: "link.chain.ton.ccip.TokenRegistry"

    storage: TokenRegistry_Storage
    incomingMessages: TokenRegistry_InMessage
}

const CONTRACT_VERSION = "1.6.0";

fun onInternalMessage(in: InMessage) {
    val msg = lazy TokenRegistry_InMessage.fromSlice(in.body);

    match (msg) {
        TokenRegistry_GetTokenInfo => {
            //TODO: min value assertion
            onGetTokenInfo(msg, in.senderAddress);
        }
        TokenRegistry_SetTokenInfo => {
            onSetTokenInfo(msg, in.senderAddress);
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

fun onSetTokenInfo(msg: TokenRegistry_SetTokenInfo, sender: address) {
    //TODO access control
    var st = TokenRegistry_Storage.load();
    st.tokenInfo = msg.info;
    st.store();
}

fun onGetTokenInfo(msg: TokenRegistry_GetTokenInfo, sender: address) {
    val st = TokenRegistry_Storage.load();
    var tokenPool: address? = null;
    if (st.tokenInfo.enabled) {
        tokenPool = st.tokenInfo.tokenPool;
    }
    val response = createMessage({
        dest: sender,
        value: 0,
        bounce: false,
        body: TokenRegistry_ReturnTokenInfo {
            minterAddress: st.tokenInfo.minterAddress,
            tokenPool,
        }
    });
    response.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}
