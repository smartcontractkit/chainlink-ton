import "../token_admin_registry_entry/types"
import "types"

type TokenAdminRegistry_InMessage =
    | TokenAdminRegistry_SetEntryDeployment
    | TokenAdminRegistry_RegisterToken;

// crc32('TokenAdminRegistry_SetEntryDeployment')
struct (0x3ec09499) TokenAdminRegistry_SetEntryDeployment {
    entryDeployment: TokenAdminRegistry_EntryDeployment;
}

// crc32('TokenAdminRegistry_RegisterToken')
struct (0x9ab89f26) TokenAdminRegistry_RegisterToken {
    tokenAddress: address;
    tokenInfo: TokenRegistry_TokenInfo;
    administrator: address;
    isNewEntry: bool;
}
