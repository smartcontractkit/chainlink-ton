// SPDX-License-Identifier: BUSL-1.1

const TokenAdminRegistryEntry_FACILITY_NAME = "link.chain.ton.ccip.TokenAdminRegistryEntry";
const TokenAdminRegistryEntry_FACILITY_ID = TokenAdminRegistryEntry_FACILITY_NAME.crc32() % 640 + 10;

enum TokenAdminRegistryEntry_Error {
    Unauthorized = TokenAdminRegistryEntry_FACILITY_ID * 100
    OnlyPendingAdministrator
    AlreadyRegistered
    InvalidAdministrator
}
