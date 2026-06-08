import "types"

type TokenRegistry_InMessage = 
    | TokenRegistry_GetTokenInfo;

// crc32('TokenRegistry_GetTokenInfo')
struct (0xDD5D5127) TokenRegistry_GetTokenInfo {
}

// Outgoing messages
struct (0xB8F88A81) TokenRegistry_ReturnTokenInfo {
    tokenInfo: TokenRegistry_TokenInfo,
}
