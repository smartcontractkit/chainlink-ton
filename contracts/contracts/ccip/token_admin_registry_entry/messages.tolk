import "types"

type TokenRegistry_InMessage =
    | TokenRegistry_SetTokenInfo
    | TokenRegistry_GetTokenInfo
    | TokenAdminRegistryEntry_ProposeAdministrator
    | TokenAdminRegistryEntry_TransferAdminRole
    | TokenAdminRegistryEntry_AcceptAdminRole
    | TokenAdminRegistryEntry_SetPool;

// crc32('TokenRegistry_GetTokenInfo')
struct (0xDD5D5127) TokenRegistry_GetTokenInfo {}

fun TokenRegistry_GetTokenInfo.cost(responseHandlerCost: coins): coins {
    return
        + ton("0.002")
        + ton("0.019")
        + responseHandlerCost;
}

// crc32('TokenRegistry_SetTokenInfo')
struct (0xd24387a4) TokenRegistry_SetTokenInfo {
    info: TokenRegistry_TokenInfo
}

struct (0x31d2bb6e) TokenAdminRegistryEntry_ProposeAdministrator {
    administrator: address
}

struct (0x5f7f84e1) TokenAdminRegistryEntry_TransferAdminRole {
    newAdministrator: address?
}

struct (0xd1fbd97c) TokenAdminRegistryEntry_AcceptAdminRole {}

struct (0xa7c4c16c) TokenAdminRegistryEntry_SetPool {
    tokenPool: address
    enabled: bool
}

struct (0xddccddb5) TokenRegistry_ReturnTokenInfo {
    minterAddress: address
    tokenPool: address?
}
