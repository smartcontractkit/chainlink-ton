import "../../ccip/types"

tolk 1.0

// The tag used to signal support for the pool v1 standard.
// bytes4(keccak256("CCIP_POOL_V1"))
// const CCIP_POOL_V1 : bytes4 = 0xaff2afbf as bytes4 // TODO we don't know if we need this

// The number of bytes in the return data for a pool v1 releaseOrMint call.
// This should match the size of the ReleaseOrMintOutV1 struct.
const CCIP_POOL_V1_RET_BYTES : uint16 = 32

// The default max number of bytes in the return data for a pool v1 lockOrBurn call.
// This data can be used to send information to the destination chain token pool. Can be overwritten
// in the TokenTransferFeeConfig.destBytesOverhead if more data is required.
const CCIP_LOCK_OR_BURN_V1_RET_BYTES : uint32 = 32

//crc32('Pool_LockOrBurnInV1')
struct (0x179B4A8C)Pool_LockOrBurnInV1 {
    msg: Cell<CCIPSend>
    receiver: CrossChainAddress //  The recipient of the tokens on the destination chain, abi encoded.
    remoteChainSelector: uint64 // ─╮ The chain ID of the destination chain.
    originalSender: address // ─────╯ The original sender of the tx on the source chain.
    amount: coins //  The amount of tokens to lock or burn, denominated in the source token's decimals.
    localToken: address //  The address on this chain of the token to lock or burn.
}

//crc32('Pool_LockOrBurnOutV1')
struct (0x56E7EB1A)Pool_LockOrBurnOutV1 {
    msg: Cell<CCIPSend>
    // The address of the destination token, abi encoded in the case of EVM chains.
    // This value is UNTRUSTED as any pool owner can return whatever value they want.
    destTokenAddress: CrossChainAddress
    // Optional pool data to be transferred to the destination chain. Be default this is capped at
    // CCIP_LOCK_OR_BURN_V1_RET_BYTES bytes. If more data is required, the TokenTransferFeeConfig.destBytesOverhead
    // has to be set for the specific token.
    destPoolData: slice
}

//crc32('Pool_ReleaseOrMintInV1')
struct (0x1703AC0B)Pool_ReleaseOrMintInV1 {
    msg: Cell<CCIPSend>
    originalSender: CrossChainAddress //            The original sender of the tx on the source chain.
    remoteChainSelector: uint64 // ───╮ The chain ID of the source chain.
    receiver: address // ─────────────╯ The recipient of the tokens on the destination chain.
    sourceDenominatedAmount: coins // The amount of tokens to release or mint, denominated in the source token's decimals.
    localToken: address //              The address on this chain of the token to release or mint.
    /// @dev WARNING: sourcePoolAddress should be checked prior to any processing of funds. Make sure it matches the
    /// expected pool address for the given remoteChainSelector.
    sourcePoolAddress: CrossChainAddress //         The address of the source pool, abi encoded in the case of EVM chains.
    sourcePoolData: CrossChainAddress //            The data received from the source pool to process the release or mint.
    /// @dev WARNING: offchainTokenData is untrusted data.
    offchainTokenData: CrossChainAddress //         The offchain data to process the release or mint.
}

//crc32('Pool_ReleaseOrMintOutV1')
struct (0x0D347F43)Pool_ReleaseOrMintOutV1 {
    msg: Cell<CCIPSend>
    // The number of tokens released or minted on the destination chain, denominated in the local token's decimals.
    // This value is expected to be equal to the ReleaseOrMintInV1.amount in the case where the source and destination
    // chain have the same number of decimals.
    destinationAmount: coins
}
