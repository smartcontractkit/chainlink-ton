// SPDX-License-Identifier: BUSL-1.1
import "types"

enum OffRamp_Error {
    MessageNotFromOwnedContract = OffRamp_FACILITY_ID * 100
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
    InvalidInterval
    BatchingNotSupported
    OnRampAddressMismatch
    EmptyCommitReport
    MerkleRootCannotBeZero
    UnsupportedNumberOfTokens
    ManualExecutionGasAmountCountMismatch
    InvalidManualExecutionGasLimit
    UnexpectedTokenData
    MsgDataTooLarge
    UnexpectedExtraData
    TokenAdminRegistryNotSet
    TokenAdminRegistryAlreadySet
    UnhandledLegacyBounce
    // Not enough gasLimit for CCIPReceive execution
    NotEnoughGas
    // Not enough destGasAMount for token transfer
    NotEnoughDestGasAmount
}
