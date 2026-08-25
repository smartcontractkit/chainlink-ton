import "../token_admin_registry_entry/types"
import "types"

type TokenAdminRegistry_InMessage =
    | TokenAdminRegistry_SetEntryDeployment
    | TokenAdminRegistry_SetTokenInfo;

// crc32('TokenAdminRegistry_SetEntryDeployment')
struct (0x3ec09499) TokenAdminRegistry_SetEntryDeployment {
    entryDeployment: TokenAdminRegistry_EntryDeployment;
}

// crc32('TokenAdminRegistry_SetTokenInfo')
struct (0xe34153dd) TokenAdminRegistry_SetTokenInfo {
    tokenAddress: address;
    tokenInfo: TokenRegistry_TokenInfo;
    isNewEntry: bool;
}
