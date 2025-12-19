enum Error {
    MessageNotFromOwnedContract = 8400
    SourceChainNotEnabled
    EmptyExecutionReport
    InvalidMessageDestChainSelector
    SourceChainSelectorMismatch
    InvalidOnRampUpdate
    InsufficientFee
    SubjectCursed
    Unauthorized
    ZeroAddressNotAllowed
    TooManyMessagesInReport
    SignatureVerificationRequiredInCommitPlugin
    SignatureVerificationNotAllowedInExecutionPlugin
    BatchingNotSupported
}
