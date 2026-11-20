// SPDX-License-Identifier: BUSL-1.1

import "../../lib/access/ownable_2step"
import "../lib/cross_chain_address/types"

import "lib/token_pool/types"
import "lib/token_pool/budget"
import "lib/token_pool/entrypoint"
import "lib/token_pool/messages"
import "lib/token_pool/events"
import "lib/token_pool/errors"

contract TokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.pool.TokenPool"

    storage: TokenPool_Data
    incomingMessages: TokenPool_InMessage | Ownable2Step_Messages
    outgoingMessages: TokenPool_OutMessage
    emittedEvents: TokenPool_Events
    thrownErrors: TokenPool_Error
}

// --- Getters matching Go bindings in pkg/ccip/bindings/tokenpool/reader.go ---
// This is a stub contract for tooling to generate bindings.
// All getters throw at runtime — they should never be deployed.

get fun typeAndVersion(): (slice, slice)

get fun facilityId(): uint16 

get fun errorCode(local: uint16): uint16

get fun token(): address

get fun tokenDecimals(): uint8

get fun isSupportedChain(remoteChainSelector: uint64): bool

/// Matches Go binding GetVerifyNotCursed (Name: "verifyNotCursed").
get fun verifyNotCursed(subject: uint128): bool

get fun owner(): address

get fun pendingOwner(): address?

/// Curse administrator for the pool-local policy, distinct from `owner`.
get fun rmn_owner(): address

get fun rmn_pendingOwner(): address?

get fun rmn_hasRole(role: uint256, account: address): bool

get fun rmn_getRoleAdmin(role: uint256): uint256

/// Effective curse authority. `rmn_hasRole` under-reports: the policy admin is
/// an implicit role bearer.
get fun rmn_canCurse(account: address): bool

get fun rmn_canUncurse(account: address): bool

/// Matches Go binding GetSupportedChains (Name: "getSupportedChains").
get fun getSupportedChains(): lisp_list<uint64>

/// Matches Go binding GetDynamicConfig (Name: "getDynamicConfig").
get fun getDynamicConfig(): TokenPool_DynamicConfig

/// Matches Go binding GetAllowedFinalityConfig (Name: "getAllowedFinalityConfig").
get fun getAllowedFinalityConfig(): uint32

/// Matches Go binding GetAdvancedPoolHooks (Name: "getAdvancedPoolHooks").
get fun getAdvancedPoolHooks(): address?

/// Matches Go binding GetIsRemotePool (Name: "isRemotePool").
get fun isRemotePool(remoteChainSelector: uint64, remotePoolAddress: Cell<CrossChainAddress>): bool

/// Matches Go binding GetRemoteToken (Name: "getRemoteToken").
get fun getRemoteToken(remoteChainSelector: uint64): Cell<CrossChainAddress>

/// Matches Go binding GetRemotePools (Name: "getRemotePools").
get fun getRemotePools(remoteChainSelector: uint64): lisp_list<Cell<CrossChainAddress>>

/// Matches Go binding GetTokenTransferFeeConfig (Name: "getTokenTransferFeeConfig").
get fun getTokenTransferFeeConfig(destChainSelector: uint64): TokenPool_TokenTransferFeeConfig?

/// Matches Go binding GetCurrentRateLimiterState (Name: "getCurrentRateLimiterState").
get fun getCurrentRateLimiterState(remoteChainSelector: uint64, fastFinality: bool): TokenPool_RateLimiterPair

/// Matches Go binding GetCursedSubjects (Name: "cursedSubjects").
get fun cursedSubjects(): lisp_list<uint128>

/// Matches Go binding GetAdminConfig (Name: "getAdminConfig").
get fun getAdminConfig(): TokenPool_AdminConfig

/// Matches Go binding GetRemoteChainConfig (Name: "getRemoteChainConfig").
get fun getRemoteChainConfig(remoteChainSelector: uint64): TokenPool_RemoteChainConfig?

/// Matches Go binding GetFee (Name: "getFee").
get fun getFee(
    localToken: address,
    destChainSelector: uint64,
    amount: coins,
    feeToken: address,
    requestedFinalityConfig: uint32,
    tokenArgs: cell?,
): (coins, uint32, uint32, uint16, bool)

/// Matches Go binding GetFeeAmount (Name: "getFeeAmount").
get fun getFeeAmount(
    transfer: TokenPool_LockOrBurnTransfer,
    requestedFinalityConfig: uint32,
): coins

/// Matches Go binding GetCCVAmount (Name: "getCCVAmount").
get fun getCCVAmount(
    remoteChainSelector: uint64,
    sourceDenominatedAmount: coins,
    requestedFinalityConfig: uint32,
    direction: TokenPool_MessageDirection,
    extraData: cell?,
): coins

/// Matches Go binding GetIsSupportedToken (Name: "isSupportedToken").
get fun isSupportedToken(token: address): bool

/// Effective per-flow budget (instance config raised to the pool-type default).
get fun getBudget(): TokenPool_Budget

/// Fees retained in the pool's own Jetton wallet on successful locks/burns.
get fun getAccruedFees(): coins
