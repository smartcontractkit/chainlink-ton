import "../../../../lib/utils"
import "../../cross_chain_address/types"
import "../common/types"
import "types"

// Answers with Router_CCIPSendACK or Router_CCIPSendNACK
struct (0x31768d95) Router_CCIPSend {
    queryID: uint64;
    destChainSelector: uint64;
    receiver: CrossChainAddress;
    data: cell;
    tokenAmounts: SnakedCell<TokenAmount>;
    feeToken: address?;
    extraArgs: Cell<ExtraArgs>;
}

// Acknowledgment returned by the Router for a CCIP send request.
// Indicates that the request was successfully processed.
struct (0x78d0f21e) Router_CCIPSendACK {
    queryID: uint64;
    messageId: uint256;
}

// nolint:opcode : crc32('Router_CCIPSendNACK_V2')
struct (0x7c17e3df) Router_CCIPSendNACK {
    queryID: uint64;
    errorCode: int32;
}
