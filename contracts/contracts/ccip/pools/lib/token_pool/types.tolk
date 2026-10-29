// SPDX-License-Identifier: BUSL-1.1
import "../../../../lib/utils"
import "../../../lib/cross_chain_address/types"
import "../../../rmn_remote/lib"

import "../rate_limiter"

const TOKEN_POOL_WAIT_FOR_FINALITY_FLAG: uint32 = 0;
const TOKEN_POOL_DEFAULT_FINALITY: uint32 = TOKEN_POOL_WAIT_FOR_FINALITY_FLAG;
/// The division factor for bps. This also represents the maximum bps fee.
const TOKEN_POOL_BPS_DIVIDER: uint256 = 10000;

// The number of bytes in the return data for a pool v1 releaseOrMint call.
// This should match the size of the ReleaseOrMintOutV1 struct.
const CCIP_POOL_V1_RET_BYTES = 32;

// The default max number of bytes in the return data for a pool v1 lockOrBurn call.
// This data can be used to send information to the destination chain token pool. Can be overwritten
// in the TokenTransferFeeConfig.destBytesOverhead if more data is required.
const CCIP_LOCK_OR_BURN_V1_RET_BYTES = 32;

// Includes withdraw, lock/burn, and return custody moves budget for pre-withdraw tx.
const LB_CUSTODY_MOVES_BEFORE_WITHDRAW: int = 3;
// Includes lock/burn and return custody moves budget for pre-lock/burn tx.
const LB_CUSTODY_MOVES_BEFORE_LOCK_BURN: int = 2;
// Includes release/mint and return custody moves budget for pre-release/mint tx.
const RM_CUSTODY_MOVES_BEFORE_RELEASE_MINT: int = 2;

struct TokenPool_DynamicConfig {
    router: address;
    rateLimitAdmin: address? = null;
    feeAdmin: address?; // TODO[REFACTOR]: [NONEVM-5336] this is not being used?
}

struct TokenPool_LocalPolicy {
    // Pool-local curse policy, administered independently of the pool owner.
    //
    // In practice CCIP will not propagate curses here: self-serve pools cannot
    // be enumerated, so there is no way to fan a curse out to every pool.
    // Enforcement is centralized in the Router instead — lock-or-burn and
    // release-or-mint always arrive via the Router, which checks its own policy
    // first. This copy exists to satisfy the RMN spec and to let a pool
    // operator run a policy of its own; it is never a mirror of the Router's.
    cursePolicy: CursePolicy;
}

struct TokenPool_RateLimiterPair {
    outbound: Cell<RateLimiter_TokenBucket>;
    inbound: Cell<RateLimiter_TokenBucket>;
}

struct TokenPool_RateLimitConfigPair {
    outbound: Cell<RateLimiter_Config>; // Outbound rate limited config, meaning the rate limits for all of the onRamps for the given chain.
    inbound: Cell<RateLimiter_Config>;  // Inbound rate limited config, meaning the rate limits for all of the offRamps for the given chain.
}

struct TokenPool_ChainUpdate {
    remoteChainSelector: uint64;                           // Remote chain selector.
    remotePoolAddresses: SnakedCell<CrossChainAddress>;    // Address of the remote pool, ABI encoded in the case of a remote EVM chain.
    remoteTokenAddress: Cell<CrossChainAddress>;           // Address of the remote token, ABI encoded in the case of a remote EVM chain.
    rateLimitConfigs: Cell<TokenPool_RateLimitConfigPair>; // Rate limiter configs.
}

struct TokenPool_RemoteChainConfig {
    remoteTokenAddress: Cell<CrossChainAddress>;               // Address of the remote token, ABI encoded in the case of a remote EVM chain.
    // TODO[REFACTOR]: [NONEVM-5336] EnumerableSet.Bytes32Set remotePools;
    remotePools: map<uint256, Cell<CrossChainAddress>> = [];   // Set of remote pool hashes, ABI encoded in the case of a remote EVM chain.
    rateLimiters: Cell<TokenPool_RateLimiterPair>;             // Rate limiter configs.
    fastFinalityRateLimiters: Cell<TokenPool_RateLimiterPair>; // Rate limiter configs for fast finality transfers.
}

struct TokenPool_RateLimitConfigArgs {
    remoteChainSelector: uint64;                          // Remote chain selector.
    fastFinality: bool;                                   // Whether the rate limit config is for fast finality transfers.
    outboundRateLimiterConfig: Cell<RateLimiter_Config>;  // Outbound rate limiter configuration.
    inboundRateLimiterConfig: Cell<RateLimiter_Config>;   // Inbound rate limiter configuration.
}

/// Struct with args for setting the token transfer fee configurations for a destination chain and a set of tokens.
struct TokenPool_TokenTransferFeeConfigArgs {
    destChainSelector: uint64;                                // Destination chain selector.
    tokenTransferFeeConfig: TokenPool_TokenTransferFeeConfig; // Token transfer fee configuration.
}

// TODO[REFACTOR]: [NONEVM-5336] triage new types below

struct TokenPool_LockOrBurnPrepared {
    feeAmount: coins;
    /// Token amount in local token decimals after deducting the fee.
    // TODO[REFACTOR]: [NONEVM-5336] rename to just amount?
    destTokenAmount: coins; 
    out: TokenPool_LockOrBurnOutV1;
}

struct TokenPool_ReleaseOrMintPrepared {
    requestedFinalityConfig: uint32;
    localAmount: coins;
    out: TokenPool_ReleaseOrMintOutV1;
}

// IPoolV2

struct TokenPool_TokenTransferFeeConfig {
    destGasOverhead: uint32;            // Gas charged to execute the token transfer on the destination chain.
    destBytesOverhead: uint32;          // Data availability bytes.
    finalityFeeUSDCents: coins;         // Fee to charge for token transfer with default (wait-for-finality) finality, multiples of 0.01 USD.
    fastFinalityFeeUSDCents: coins;     // Fee to charge for token transfer with fast finality (FTF), multiples of 0.01 USD.
                                        // The following two fee is deducted from the transferred asset, not added on top.
    finalityTransferFeeBps: uint16;     // Fee in basis points for default finality transfers [0-10_000). Capped by TOKEN_POOL_BPS_DIVIDER.
    fastFinalityTransferFeeBps: uint16; // Fee in basis points for custom finality transfers [0-10_000). Capped by TOKEN_POOL_BPS_DIVIDER.
    isEnabled: bool;                    // Whether this config is enabled.
}

enum TokenPool_MessageDirection: uint8 {
    Outbound = 0
    Inbound = 1
}

/// Struct representing a token transfer operation, including the unique transfer ID and the details of the transfer.
/// 
/// Type parameters:
/// - `S`: The type of the original sender's address on the source chain
/// - `R`: The type of the recipient's address on the destination chain
/// - `C`: The type of the amount of tokens, denominated in the source token's decimals
struct TokenPool_Transfer<S, R, C> {
    // TODO[REFACTOR]: [NONEVM-5336] is this the same as queryID?
    id : uint256;                                   // Unique transfer ID for this TP operation.
    details: Cell<TokenPool_TransferDetails<S, R, C>>; // Details of the transfer.
}

struct TokenPool_TransferDetails<S, R, C> {
    receiver: R;                 // The recipient of the tokens on the destination chain. For EVM source chains, this is abi-encoded (32 bytes).
    remoteChainSelector: uint64; // ─╮ The chain ID of the destination chain.
    originalSender: S;           // ─╯ The original sender of the tx on the source chain.
    amount: C;                   // The amount of tokens to process, denominated in the source token's decimals.
    localToken: address;         // The address on this chain of the token to process.
}

// Typed transfers for both directions
type TokenPool_LockOrBurnTransfer = TokenPool_Transfer<
    address,                 // sender addr
    Cell<CrossChainAddress>, // receiver addr
    coins,                   // amount
>;

type TokenPool_ReleaseOrMintTransfer = TokenPool_Transfer<
    Cell<CrossChainAddress>, // sender addr
    address,                 // receiver addr
    uint256,                 // amount
>;

struct TokenPool_LockOrBurnInV1 {
    transfer: TokenPool_LockOrBurnTransfer; // The transfer id/details for the lock or burn operation.
}

struct TokenPool_LockOrBurnOutV1 {
    // The address of the destination token, abi encoded in the case of EVM chains.
    // This value is UNTRUSTED as any pool owner can return whatever value they want.
    destTokenAddress: Cell<CrossChainAddress>;
    // Optional pool data to be transferred to the destination chain. Be default this is capped at
    // CCIP_LOCK_OR_BURN_V1_RET_BYTES bytes. If more data is required, the TokenTransferFeeConfig.destBytesOverhead
    // has to be set for the specific token.
    destPoolData: cell;
}

struct TokenPool_ReleaseOrMintInV1 {
    transfer: TokenPool_ReleaseOrMintTransfer;  // The transfer id/details for the release or mint operation.
    /// @dev WARNING: sourcePoolAddress should be checked prior to any processing of funds. Make sure it matches the
    /// expected pool address for the given remoteChainSelector.
    sourcePoolAddress: Cell<CrossChainAddress>; // The address of the source pool, abi encoded in the case of EVM chains.
    sourcePoolData: cell?;                      // The data received from the source pool to process the release or mint.
    /// @dev WARNING: offchainTokenData is untrusted data.
    offchainTokenData: cell?;                   // The offchain data to process the release or mint.
}

struct TokenPool_ReleaseOrMintOutV1 {
    // The number of tokens released or minted on the destination chain, denominated in the local token's decimals.
    // This value is expected to be equal to the ReleaseOrMintInV1.amount in the case where the source and destination
    // chain have the same number of decimals.
    destinationAmount: coins;
}
