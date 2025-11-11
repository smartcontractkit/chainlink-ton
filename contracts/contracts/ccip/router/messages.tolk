import "../common/types.tolk"
import "../common/messages"
import "../../lib/utils"
import "../../lib/funding/withdrawable.tolk";
import "../../lib/versioning/upgradeable"
import "../../lib/receiver/types"
import "../../lib/receiver/messages"
import "../offramp/types"
import "../onramp/messages"
import "../../lib/access/ownable_2step"

type Router_InMsg =
    | Router_CCIPSend
    | Router_SetRamps
    | Router_UpdateOffRamps
    | Router_RouteMessage
    | Router_CCIPReceiveConfirm
    | Upgradeable_Upgrade
    | Withdrawable_Withdraw
    | Router_RMNRemoteCurse
    | Router_RMNRemoteUncurse
    | Router_RMNRemoteVerifyNotCursed
    | Router_MessageSent
    | Router_MessageRejected
    | Router_RMNOwnableMessage
    ;

type Router_BouncedMessage = Receiver_CCIPReceive;

// update multiple chain selectors in batch to the same onramp address
//crc32("Router_SetRamps")
struct (0x20272c81) Router_SetRamps {
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

// Answers with Router_CCIPReceive
//crc32("Router_CCIPSend")
struct (0x31768d95) Router_CCIPSend {
    queryID: uint64;
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
    gasLimit: coins;
}

//crc32("Router_CCIPReceiveConfirm")
struct (0x1e55bbf6) Router_CCIPReceiveConfirm {
    execId: ReceiveExecutorId;
}

// curse/uncurse/verify uncursed (also as getter)
// crc32("Router_RMNRemoteCurse")
struct (0x41e8c1dc) Router_RMNRemoteCurse {
    queryId: uint64
    subjects: SnakedCell<uint128>
}

// crc32("Router_RMNRemoteUncurse")
struct (0x3c3f5e73) Router_RMNRemoteUncurse {
    queryId: uint64
    subjects: SnakedCell<uint128>
}

// Internal contracts can have their own cache, but external contracts will need to fetch the curse status via this method.
// crc32("Router_RMNRemoteVerifyNotCursed")
struct (0xa6e4b7e1) Router_RMNRemoteVerifyNotCursed {
    queryId: uint64
    subject: uint128
}

struct (0x0d9368a9) Router_RMNRemoteVerifyNotCursedResponse {
    queryId: uint64
    result: bool
}

// 0x6513f8e1 = crc32b("Router_MessageSent")
struct (0x6513f8e1) Router_MessageSent {
    queryID: uint64;
    messageId: uint256;
    destChainSelector: uint64;
    sender: address;
}

struct (0x8ae25114) Router_MessageRejected {
    queryID: uint64;
    destChainSelector: uint64;
    sender: address;
    error: uint256;
}

struct (0xaf7a9ac6) Router_RMNOwnableMessage {
    content: RemainingBitsAndRefs; // Ownable2Step_Messages
}

// Costs associated with Router operations
struct Router_Costs {}

// Minimum value for calling Router_CCIPSend
@inline
fun Router_Costs.CCIPSend(): int {
    return ton("0.05") // Send fwdFee TODO 
        + OnRamp_Costs.Send()
}

// Minimum value for calling Router_MessageSent
@inline
fun Router_Costs.MessageSent(): int {
    return ton("0.05"); // TODO
}

// Minimum value for calling Router_MessageRejected
@inline
fun Router_Costs.MessageRejected(): int {
    return ton("0.05"); // TODO
}




// TBD: Should we move this to lib/sender/messages.tolk? I think it only makes the sender import more dependencies. Maybe we can move this and Router_CCIPSend there so the user only imports those two messages and doesn't get confused with internal ones.
// TBD: Should we let the user define the callback opcode when creating the CCIPSend message?
// crc32("Router_CCIPSendACK")
struct (0x78d0f21e) Router_CCIPSendACK {
    queryID: uint64;
    messageId: uint256;
}

// crc32("Router_CCIPSendNACK")
struct (0x5a45d434) Router_CCIPSendNACK {
    queryID: uint64;
    error: uint256;
}
