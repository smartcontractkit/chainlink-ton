import "../../ccip/common/types"


struct Any2TVMMessage {
    messageId: uint256,
    sourceChainSelector: uint64,
    sender: CrossChainAddress,
    data: cell
}
