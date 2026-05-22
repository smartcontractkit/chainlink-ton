// SPDX-License-Identifier: BUSL-1.1

const TestReceiver_FACILITY_NAME = "link.chain.ton.ccip.test.Receiver";
const TestReceiver_FACILITY_ID = TestReceiver_FACILITY_NAME.crc32() % 640 + 10;  // 191
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

const TestReceiver_ERROR_CODE = TestReceiver_FACILITY_ID * 100;
