import "../../lib/utils"

enum Error {
    DispatchNotFromMerkleRoot = 8400
    SourceChainNotEnabled
    EmptyExecutionReport
    InvalidMessageDestChainSelector
    SourceChainSelectorMismatch
    InvalidOnRampUpdate
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.OffRamp"), local);
}

