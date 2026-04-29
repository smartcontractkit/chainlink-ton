// SPDX-License-Identifier: BUSL-1.1

const TestReceiver_FACILITY_NAME = "link.chain.ton.ccip.test.Receiver";
const TestReceiver_FACILITY_ID = 191; // (crc32(<facility>) % 640) + 10
const TestReceiver_ERROR_CODE = TestReceiver_FACILITY_ID * 100;
