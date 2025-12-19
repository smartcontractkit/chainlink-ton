enum FeeQuoter_Error {
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
    InsufficientFee
    TokenTransfersNotSupported
    UnauthorizedPriceUpdater
    ExecutionCostOverflow // Unreachable
    PremiumFeeOverflow // Unreachable
    DataAvailabilityCostOverflow // Unreachable
    FeeCalculationOverflow // Unreachable
    TokenPriceTooLow
    FeeOverflow
    MessageFeeTooHigh
}
