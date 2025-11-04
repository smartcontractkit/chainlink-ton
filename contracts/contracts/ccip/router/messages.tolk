import "../common/types.tolk"
import "../common/messages"
import "../../lib/utils"
import "../../lib/funding/withdrawable.tolk";
import "../../lib/versioning/upgradeable"
import "../../lib/receiver/types"
import "../../lib/receiver/messages"
import "../offramp/types"

type Router_InMsg =
    | Router_CCIPSend
    | Router_SetRamps
    | Router_UpdateOffRamps
    | Router_RouteMessage
    | Router_CCIPReceiveConfirm
    | Common_JettonTransferNotification
    | Upgradeable_Upgrade
    | Withdrawable_Withdraw
    | RMNRemote_Curse
    | RMNRemote_Uncurse
    | RMNRemote_VerifyNotCursed;
    ;

type Router_BouncedMessage = Receiver_CCIPReceive;

// update multiple chain selectors in batch to the same onramp address
//crc32("Router_SetRamps")
struct (0x20272c81) Router_SetRamps {
    // TODO: support onramp and offramp, support list
    queryId: uint64;
    destChainSelectors: SnakedCell<uint64>;
    onRamp: address;
}

//crc32("Router_UpdateOffRamps")
struct (0x234110a7) Router_UpdateOffRamps {
    queryId: uint64;
    sourceChainSelectorsAdd: SnakedCell<uint64>;
    offRampAdd: address?;

    sourceChainSelectorsRemove: SnakedCell<uint64>;
    offRampRemove: address?;
}

// TODO should separate CCIPSend msg (with opcode) from CCIPSend data

//crc32("Router_CCIPSend")
struct (0x31768d95) Router_CCIPSend {
    queryId: uint64;
    destChainSelector: uint64;
    receiver: CrossChainAddress;
    data: cell;
    tokenAmounts: SnakedCell<TokenAmount>;
    feeToken: address;
    extraArgs: cell;
}

//crc32("Router_RouteMessage")
struct (0xfc69c50b) Router_RouteMessage {
    message: Cell<Any2TVMMessage>;
    execId: ReceiveExecutorId;
    receiver: address;
}

//crc32("Router_CCIPReceiveConfirm")
struct (0x1e55bbf6) Router_CCIPReceiveConfirm {
    execId: ReceiveExecutorId;
}

// curse/uncurse/verify uncursed (also as getter)
// crc32("RMNRemote_Curse")
struct (0x41e8c1dc) RMNRemote_Curse {
    queryId: uint64
    subject: uint128
}

// crc32("RMNRemote_Uncurse")
struct (0x3c3f5e73) RMNRemote_Uncurse {
    queryId: uint64
    subject: uint128
}

// crc32("RMNRemote_VerifyNotCursed"
struct (0xa6e4b7e1) RMNRemote_VerifyNotCursed {
    queryId: uint64
    subject: uint128
}

struct (0x0d9368a9) RMNRemote_VerifyNotCursedResponse {
    queryId: uint64
    result: bool
}
