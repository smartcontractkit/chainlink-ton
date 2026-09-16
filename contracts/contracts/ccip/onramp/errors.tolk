// SPDX-License-Identifier: BUSL-1.1
import "types"

enum OnRamp_Error {
    UnknownDestChainSelector = OnRamp_FACILITY_ID * 100
    Unauthorized
    SenderNotAllowed
    InvalidConfig
    UnknownToken
    InsufficientValue
}
