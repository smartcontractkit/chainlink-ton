// SPDX-License-Identifier: BUSL-1.1
import "types"

enum FeeQuoter_Error {
    UnsupportedChainFamilySelector = FeeQuoter_FACILITY_ID * 100
    GasLimitTooHigh
    ExtraArgOutOfOrderExecutionMustBeTrue
    InvalidExtraArgsData
    UnsupportedNumberOfTokens
    InvalidEVMReceiverAddress
    Invalid32ByteReceiverAddress
    InvalidSuiReceiverAddress
    InvalidSVMReceiverAddress
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
    // Deprecated: retained to preserve the numeric values of subsequent public errors.
    TokenTransfersNotSupported
    UnauthorizedPriceUpdater
    ExecutionCostOverflow
    PremiumFeeOverflow
    // Deprecated: retained to preserve the numeric values of subsequent public errors.
    DataAvailabilityCostOverflow
    FeeCalculationOverflow
    TokenPriceTooLow
    FeeOverflow
    MessageFeeTooHigh
    TokenTransferConfigMustBeEnabled
    InvalidDestBytesOverhead
    InvalidSVMExtraArgsWritableBitmap
}
