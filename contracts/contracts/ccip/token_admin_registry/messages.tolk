import "../token_admin_registry_entry/types"
import "types"

type TokenAdminRegistry_InMessage =
    | TokenAdminRegistry_SetEntryDeployment
    | TokenAdminRegistry_RegisterToken
    | TokenAdminRegistry_OverridePendingAdministrator;

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
