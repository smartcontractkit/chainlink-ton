import "../token_admin_registry_entry/types"
import "types"

type TokenAdminRegistry_InMessage =
    | TokenAdminRegistry_SetEntryDeployment
    | TokenAdminRegistry_RegisterToken
    | TokenAdminRegistry_OverridePendingAdministrator
    | TokenAdminRegistry_AdministratorTransferRequested
    | TokenAdminRegistry_AdministratorTransferred
    | TokenAdminRegistry_PoolSet;

// crc32('TokenAdminRegistry_SetEntryDeployment')
struct (0x3ec09499) TokenAdminRegistry_SetEntryDeployment {
    entryDeployment: TokenAdminRegistry_EntryDeployment;
}

// crc32('TokenAdminRegistry_RegisterToken')
struct (0x9ab89f26) TokenAdminRegistry_RegisterToken {
    tokenAddress: address;
    tokenInfo: Cell<TokenRegistry_TokenInfo>;
    administrator: address;
}

// Replaces a proposal only while the entry has no active administrator.
// crc32('TokenAdminRegistry_OverridePendingAdministrator')
struct (0x6e6f71ef) TokenAdminRegistry_OverridePendingAdministrator {
    tokenAddress: address;
    administrator: address;
}

/// Sent by a deterministic entry to the root and emitted by the root after the
/// entry address has been validated. This is also the external event ABI.
// crc32('TokenAdminRegistry_AdministratorTransferRequested')
struct (0x140b1e91) TokenAdminRegistry_AdministratorTransferRequested {
    token: address;
    currentAdministrator: address?;
    newAdministrator: address?;
}

// crc32('TokenAdminRegistry_AdministratorTransferred')
struct (0xe2c74db4) TokenAdminRegistry_AdministratorTransferred {
    token: address;
    newAdministrator: address;
}

/// Records both the selected pool and whether it is enabled. `enabled = false`
/// is TON's equivalent of delisting a token from CCIP.
// crc32('TokenAdminRegistry_PoolSet')
struct (0xcef01a87) TokenAdminRegistry_PoolSet {
    token: address;
    previousPool: address;
    newPool: address;
    previousEnabled: bool;
    newEnabled: bool;
}
