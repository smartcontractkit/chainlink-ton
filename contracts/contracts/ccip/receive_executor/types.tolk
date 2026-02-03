// SPDX-License-Identifier: BUSL-1.1

const ReceiveExecutor_FACILITY_NAME = "com.chainlink.ton.ccip.ReceiveExecutor";
// getFacilityId(stringCrc32(ReceiveExecutor_FACILITY_NAME));
const ReceiveExecutor_FACILITY_ID = 338;

// State stores the general state machine indicating which phase we're in
enum ReceiveExecutor_MessageState {
    Untouched = 0
    Execute
    ExecuteFailed
    Success
}
