// SPDX-License-Identifier: BUSL-1.1
const MerkleRoot_FACILITY_NAME = "link.chain.ton.ccip.MerkleRoot";
const MerkleRoot_FACILITY_ID = MerkleRoot_FACILITY_NAME.crc32() % 640 + 10;  // 186
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions
