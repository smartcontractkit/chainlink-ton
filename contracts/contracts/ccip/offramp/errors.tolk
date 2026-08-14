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
    // TBD: these two errors are never thrown, but are catched to block execution of messages with invalid gas overrides. Maybe they don't belong to this enum
    ManualExecutionGasAmountCountMismatch
}
