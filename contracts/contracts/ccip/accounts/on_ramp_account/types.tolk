// SPDX-License-Identifier: BUSL-1.1

/// Facility ID used for error code derivation; (crc32(<facility>) % 640) + 10
const OnRampAccount_FACILITY_NAME = "link.chain.ton.ccip.account.OnRampAccount";
const OnRampAccount_FACILITY_ID = OnRampAccount_FACILITY_NAME.crc32() % 640 + 10;
