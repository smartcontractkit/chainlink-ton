// SPDX-License-Identifier: BUSL-1.1
import "types"

enum CCIPSendExecutor_Error {
    StateNotExpected = CCIPSendExecutor_FACILITY_ID * 100
    Unauthorized
    InsufficientFunds
    InsufficientFee
    FeeQuoterBounce
    OnRampFeeReservationBounce
    TokenNotEnabled
    TokenPoolBounce
    UnsupportedNumberOfTokens
    InvalidValidatedFee
    TokenRegistryBounce
    MissingDestOverhead
    /// A legacy 256-bit bounce. Only sends whose bounce is not handled yet produce them.
    UnhandledLegacyBounce
}
