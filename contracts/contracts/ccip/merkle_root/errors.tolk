// SPDX-License-Identifier: BUSL-1.1
import "types"

enum MerkleRoot_Error {
    AlreadyExecuted = MerkleRoot_FACILITY_ID * 100
    NotOwner
    ManualExecutionNotYetEnabled
    SkippedAlreadyExecutedMessage
    InvalidState
    SeqNumOutOfBounds
    /// A legacy 256-bit bounce. Every MerkleRoot send is RichBounce or NoBounce, so none is expected.
    UnhandledLegacyBounce
}
