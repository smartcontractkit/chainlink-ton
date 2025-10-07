import "../../lib/utils"

enum Error {
    UnsupportedChainFamilySelector = 24800 // Facility ID * 100
    GasLimitTooHigh
    ExtraArgOutOfOrderExecutionMustBeTrue
    InvalidExtraArgsData
    UnsupportedNumberOfTokens
    InvalidSuiReceiverAddress
    InvalidTokenReceiver
    TooManySuiExtraArgsReceiverObjectIds
    MsgDataTooLarge
    StaleGasPrice
    DestChainNotEnabled
    FeeTokenNotSupported
    InvalidMsgData
    TokenNotSupported
    UnknownDestChainSelector
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.ccip.FeeQuoter"), local);
}
