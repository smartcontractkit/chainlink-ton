// SPDX-License-Identifier: BUSL-1.1
import "types"

enum CCIPSendExecutor_Error {
    StateNotExpected = CCIPSendExecutor_FACILITY_ID * 100
    Unauthorized
    InsufficientFunds
    InsufficientFee
    FeeQuoterBounce
    TokenNotEnabled
    TokenPoolBounce
    UnsupportedNumberOfTokens
    InvalidValidatedFee
    /// The token's registered minter is not the token itself, which on-ramp accounts are keyed by.
    TokenMinterMismatch
}
