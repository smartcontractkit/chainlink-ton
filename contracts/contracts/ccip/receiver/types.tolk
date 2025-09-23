import "../common/types.tolk";

struct Any2TVMMessage {
    messageId: uint256,
    sourceChainSelector: uint64,
    sender: CrossChainAddress,
    data: cell
}
