import "types"

type TokenAdminRegistryEntry_InMessage =
    | TokenAdminRegistryEntry_SetTokenInfo
    | TokenAdminRegistryEntry_GetTokenInfo
    | TokenAdminRegistryEntry_RegistrationInitialized
    | TokenAdminRegistryEntry_ProposeAdministrator
    | TokenAdminRegistryEntry_TransferAdminRole
    | TokenAdminRegistryEntry_AcceptAdminRole
    | TokenAdminRegistryEntry_SetPool;

// crc32('TokenAdminRegistryEntry_GetTokenInfo')
struct (0x7aef4c2d) TokenAdminRegistryEntry_GetTokenInfo {}

fun TokenAdminRegistryEntry_GetTokenInfo.cost(responseHandlerCost: coins): coins {
    return
        + ton("0.002")
        + ton("0.019")
        + responseHandlerCost;
}

// crc32('TokenAdminRegistryEntry_SetTokenInfo')
struct (0x75f19aae) TokenAdminRegistryEntry_SetTokenInfo {
    info: TokenRegistry_TokenInfo
}

// crc32('TokenAdminRegistryEntry_RegistrationInitialized')
// Sent only by Deployable_InitializeAndSend after initial state installation.
struct (0x31580269) TokenAdminRegistryEntry_RegistrationInitialized {}

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

// crc32('TokenAdminRegistryEntry_ReturnTokenInfo')
struct (0x0a58e678) TokenAdminRegistryEntry_ReturnTokenInfo {
    minterAddress: address
    tokenPool: address?
    version: uint32
}
