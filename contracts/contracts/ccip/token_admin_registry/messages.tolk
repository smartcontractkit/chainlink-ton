import "../token_admin_registry_entry/types"
import "types"

type TokenAdminRegistry_InMessage =
    | TokenAdminRegistry_SetEntryDeployment
    | TokenAdminRegistry_RegisterToken
    | TokenAdminRegistry_OverridePendingAdministrator
    | TokenAdminRegistry_TransferAdminRole
    | TokenAdminRegistry_AcceptAdminRole
    | TokenAdminRegistry_AdministratorTransferRequested
    | TokenAdminRegistry_AdministratorTransferred
    | TokenAdminRegistry_PoolSet;

// crc32('TokenAdminRegistry_SetEntryDeployment')
struct (0x3ec09499) TokenAdminRegistry_SetEntryDeployment {
    queryId: uint64;
    entryDeployment: TokenAdminRegistry_EntryDeployment;
}

// crc32('TokenAdminRegistry_RegisterToken')
struct (0x9ab89f26) TokenAdminRegistry_RegisterToken {
    queryId: uint64;
    tokenAddress: address;
    tokenInfo: Cell<TokenRegistry_TokenInfo>;
    administrator: address;
}

// Replaces a proposal only while the entry has no active administrator.
// crc32('TokenAdminRegistry_OverridePendingAdministrator')
struct (0x6e6f71ef) TokenAdminRegistry_OverridePendingAdministrator {
    queryId: uint64;
    tokenAddress: address;
    administrator: address;
}

/// Requests a transfer for the entry derived from `tokenAddress`. The root
/// forwards its sender as the trusted `actor`; it intentionally stores no
/// per-token administrator state.
// crc32('TokenAdminRegistry_TransferAdminRole')
struct (0xdc67ebd0) TokenAdminRegistry_TransferAdminRole {
    queryId: uint64;
    tokenAddress: address;
    newAdministrator: address?;
}

/// Accepts the pending administrator role for the derived entry. The root
/// forwards its sender as the trusted `actor` to the entry.
// crc32('TokenAdminRegistry_AcceptAdminRole')
struct (0xbe28e166) TokenAdminRegistry_AcceptAdminRole {
    queryId: uint64;
    tokenAddress: address;
}

/// Sent by a deterministic entry to the root and emitted by the root after the
/// entry address has been validated. This is also the external event ABI.
// crc32('TokenAdminRegistry_AdministratorTransferRequested')
struct (0x140b1e91) TokenAdminRegistry_AdministratorTransferRequested {
    queryId: uint64;
    token: address;
    currentAdministrator: address?;
    newAdministrator: address?;
}

// crc32('TokenAdminRegistry_AdministratorTransferred')
struct (0xe2c74db4) TokenAdminRegistry_AdministratorTransferred {
    queryId: uint64;
    token: address;
    newAdministrator: address;
}

/// Records a pool update. A null pool delists the token from CCIP.
// crc32('TokenAdminRegistry_PoolSet')
struct (0xcef01a87) TokenAdminRegistry_PoolSet {
    queryId: uint64;
    token: address;
    previousPool: address?;
    newPool: address?;
}
