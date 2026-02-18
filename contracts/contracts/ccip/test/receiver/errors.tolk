// SPDX-License-Identifier: BUSL-1.1
const TEST_RECEIVER_FACILITY_NAME = "link.chain.ton.ccip.test.Receiver";
const TEST_RECEIVER_FACILITY_ID = 191;
const TEST_RECEIVER_ERROR_CODE = TEST_RECEIVER_FACILITY_ID * 100;

enum TestReceiver_Error {
    Rejected = TEST_RECEIVER_ERROR_CODE
}
