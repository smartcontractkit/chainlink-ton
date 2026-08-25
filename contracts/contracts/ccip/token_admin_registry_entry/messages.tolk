import "types"

type TokenRegistry_InMessage =
    | TokenRegistry_SetTokenInfo
    | TokenRegistry_GetTokenInfo;

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

struct (0xddccddb5) TokenRegistry_ReturnTokenInfo {
    minterAddress: address
    tokenPool: address?
}
