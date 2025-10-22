import "../common/types.tolk"
import "../common/messages"
import "../../lib/utils"
import "../../lib/funding/withdrawable.tolk";
import "../../lib/versioning/upgradeable"
import "../../lib/receiver/types"
import "../../lib/receiver/messages"

type Router_InMsg =
    | Router_CCIPSend
    | Router_SetRamps
    | Router_UpdateOffRamps
    | Router_RouteMessage
    | Router_CCIPReceiveConfirm
    | Common_JettonTransferNotification
    | Upgradeable_Upgrade
    | Withdrawable_Withdraw
    ;

type Router_BouncedMessage = Receiver_CCIPReceive;

// update multiple chain selectors in batch to the same onramp address
struct (0x10000001) Router_SetRamps {
    // TODO: support onramp and offramp, support list
    queryId: uint64;
    destChainSelectors: SnakedCell<uint64>;
    onRamp: address;
}

struct (0x00000005) Router_UpdateOffRamps {
    queryId: uint64;
    sourceChainSelectorsAdd: SnakedCell<uint64>;
    offRampAdd: address?;

    sourceChainSelectorsRemove: SnakedCell<uint64>;
    offRampRemove: address?;
}

// TODO should separate CCIPSend msg (with opcode) from CCIPSend data

struct (0x00000001) Router_CCIPSend {
    queryId: uint64;
    destChainSelector: uint64;
    receiver: CrossChainAddress;
    data: cell;
    tokenAmounts: SnakedCell<TokenAmount>;
    feeToken: address;
    extraArgs: cell;
}

struct (0x00000003) Router_RouteMessage {
    message: Cell<Any2TVMMessage>; //TODO maybe without typed cell it fits
    execId: uint224;
    receiver: address;
}

struct (0x00000006) Router_CCIPReceiveConfirm {
    execId: uint224;
}
