import "types"

enum Router_Error {
    DestChainNotEnabled = Router_FACILITY_ID * 100
    SourceChainNotEnabled
    SenderIsNotOffRamp
    OffRampNotSetForSelector
    OffRampAddressMismatch
    SubjectCursed
    NotOnRamp
    MissingTokenAmounts
    NoMultiTokenTransfers
    InsufficientFee
}
