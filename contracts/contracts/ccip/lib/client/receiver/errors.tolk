// SPDX-License-Identifier: MIT
const RECEIVER_FACILITY_NAME = "link.chain.ton.ccip.lib.Receiver";
const RECEIVER_FACILITY_ID = RECEIVER_FACILITY_NAME.crc32() % 640 + 10;  // 54
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

const RECEIVER_ERROR_CODE = RECEIVER_FACILITY_ID * 100;

enum Receiver_Error {
    Unauthorized = RECEIVER_ERROR_CODE, // 5400,
    LowValue,
}
