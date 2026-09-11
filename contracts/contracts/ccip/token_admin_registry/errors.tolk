// SPDX-License-Identifier: BUSL-1.1

const TokenAdminRegistry_FACILITY_NAME = "link.chain.ton.ccip.TokenAdminRegistry";
const TokenAdminRegistry_FACILITY_ID = TokenAdminRegistry_FACILITY_NAME.crc32() % 640 + 10;

enum TokenAdminRegistry_Error {
    /// A lifecycle notification was not sent by the deterministic entry for
    /// the token carried in its payload.
    UnauthorizedEntry = TokenAdminRegistry_FACILITY_ID * 100
}
