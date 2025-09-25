import "storage"
import "../types"

tolk 1.1

type TokenRegistry_InMessage = 
    | TokenRegistry_SetInfo
    | TokenRegistry_GetTokenInfo


// crc32('TokenRegistry_SetInfo')
struct (0x22E22393)TokenRegistry_SetInfo {
    queryId: uint64
    info: TokenRegistry_TokenInfo
}
 
// crc32('TokenRegistry_GetTokenInfo')
struct (0xDD5D5127)TokenRegistry_GetTokenInfo {
    queryId: uint64
    ccipSend: Cell<CCIPSend>
    executorJettonWallet: address
}

// Outgoing messages

struct (0xB8F88A81)TokenRegistry_TokenPoolInfo {
    queryId: uint64,
    tokenPool: address,
}