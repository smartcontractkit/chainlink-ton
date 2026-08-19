// SPDX-License-Identifier: MIT
import "types"

enum Verifier_Error {
    ConfigDigestAlreadySet   = Verifier_FACILITY_ID * 100
    ConfigDigestNotSet
    DigestInactive
    FaultToleranceMustBePositive
    ExcessSigners
    InsufficientSigners
    MalformedPayload
    MismatchedSignatures
    IncorrectSignatureCount
    ZeroAddress
    NonUniqueSigningKeys
    InvalidSignature
    UnauthorizedSigner
    PrevSignerCountMismatch
    PrevSignerNotFound
}
