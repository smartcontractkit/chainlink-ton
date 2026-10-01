import "../token_admin_registry_entry/types"
import "../token_admin_registry_entry/messages"
import "../../lib/versioning/upgradeable"

type TokenAdminRegistry_InMessage =
    | TokenAdminRegistry_RegisterToken
    | TokenAdminRegistry_OverridePendingAdministrator
    | TokenAdminRegistry_TransferAdminRole
    | TokenAdminRegistry_AcceptAdminRole
    | TokenAdminRegistry_SetPool
    | TokenAdminRegistry_GetTokenInfo
    | TokenAdminRegistryEntry_TokenInfo
    | TokenAdminRegistry_EntryUpgradeRequest
    | TokenAdminRegistry_UpgradeEntry
    | Upgradeable_Upgrade
    | TokenAdminRegistry_AdministratorTransferRequested
    | TokenAdminRegistry_AdministratorTransferred
    | TokenAdminRegistry_PoolSet;

/// Root messages to an entry that may come back as rich bounces.
type TokenAdminRegistry_BouncedEntryMessage =
    | TokenAdminRegistryEntry_MessageFromRoot
    | TokenAdminRegistryEntry_Resume;

// crc32('TokenAdminRegistry_RegisterToken')
struct (0xbe8621a2) TokenAdminRegistry_RegisterToken {
    queryId: uint64;
    tokenAddress: address;
    tokenInfo: Cell<TokenRegistry_TokenInfo>;
    administrator: address;
}

// Replaces a proposal only while the entry has no active administrator.
// crc32('TokenAdminRegistry_OverridePendingAdministrator')
struct (0xfddaa034) TokenAdminRegistry_OverridePendingAdministrator {
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

/// Sets the pool of the derived entry. The root forwards its sender as the
/// trusted `actor`; the entry checks it is the active administrator.
// crc32('TokenAdminRegistry_SetPool')
struct (0x37bcaede) TokenAdminRegistry_SetPool {
    queryId: uint64;
    tokenAddress: address;
    /// A null pool delists the token from CCIP.
    tokenPool: address?;
}

/// CCIP read path: resolves the token info of the entry derived from `token`
/// and replies TokenAdminRegistry_TokenInfo to the sender, or
/// TokenAdminRegistry_GetTokenInfoFailed if the token is not registered.
// crc32('TokenAdminRegistry_GetTokenInfo')
struct (0xec5f855e) TokenAdminRegistry_GetTokenInfo {
    queryId: uint64;
    token: address;
}

/// Covers root -> entry -> root -> requester, a possible upgrade of a stale
/// entry on the way, and the requester's handling of the reply.
fun TokenAdminRegistry_GetTokenInfo.cost(responseHandlerCost: coins): coins {
    return grams("0.01") + TokenAdminRegistryEntry_upgradeRoundTripCost() + responseHandlerCost;
}

// crc32('TokenAdminRegistry_TokenInfo')
struct (0x0a9bf5d1) TokenAdminRegistry_TokenInfo {
    queryId: uint64;
    token: address;
    minterAddress: address;
    /// A null pool means the token is delisted from CCIP.
    tokenPool: address?;
    /// Pool interface version.
    version: uint32;
}

/// Sent to the GetTokenInfo requester when the entry could not answer, which
/// means the token was never registered.
// crc32('TokenAdminRegistry_GetTokenInfoFailed')
struct (0xe533c614) TokenAdminRegistry_GetTokenInfoFailed {
    queryId: uint64;
    token: address;
}

/// Sent by a stale entry with the request it deferred. The root answers with an
/// Upgrade to its compiled-in entry code, then the request as a Resume.
// crc32('TokenAdminRegistry_EntryUpgradeRequest')
struct (0x55b8b654) TokenAdminRegistry_EntryUpgradeRequest {
    queryId: uint64;
    token: address;
    request: Cell<TokenAdminRegistryEntry_MessageFromRoot>;
}

/// Permissionless: upgrades the derived entry to the root's entry code.
// crc32('TokenAdminRegistry_UpgradeEntry')
struct (0x4d52f09d) TokenAdminRegistry_UpgradeEntry {
    queryId: uint64;
    tokenAddress: address;
}

/// Minimum value for requests the root forwards to an entry. Covers the entry
/// operation and a possible upgrade of a stale entry on the way.
fun TokenAdminRegistry_forwardCost(): coins {
    return grams("0.015") + TokenAdminRegistryEntry_upgradeRoundTripCost();
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
