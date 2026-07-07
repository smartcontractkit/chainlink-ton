// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/lisp-lists"

import "../common/types"

import "lib/token_pool/types"
import "lib/token_pool/entrypoint"
import "lib/token_pool/messages"
import "lib/token_pool/events"

contract TokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.TokenPool"

    storage: TokenPool_Data
    incomingMessages: TokenPool_InMessage // TODO: all incoming messages should be registered
    outgoingMessages: TokenPool_OutMessage
    emittedEvents: TokenPool_Events
}

fun onInternalMessage(_: InMessage) {
    throw 0xFFFF; // template for bindings, should not be deployed
}

// --- Getters matching Go bindings in pkg/ccip/bindings/tokenpool/reader.go ---
// This is a stub contract for tooling to generate bindings.
// All getters throw at runtime — they should never be deployed.

get fun typeAndVersion(): (slice, slice) {
    throw 0xFFFF;
}

get fun token(): address {
    throw 0xFFFF;
}

get fun tokenDecimals(): uint8 {
    throw 0xFFFF;
}

get fun isSupportedChain(remoteChainSelector: uint64): bool {
    throw 0xFFFF;
}

get fun onRamp(remoteChainSelector: uint64): address? {
    throw 0xFFFF;
}

get fun offRamp(remoteChainSelector: uint64): address? {
    throw 0xFFFF;
}

/// Matches Go binding GetRMNProxy (Name: "getRMNProxy").
get fun getRMNProxy(): address {
    throw 0xFFFF;
}

/// Matches Go binding GetVerifyNotCursed (Name: "verifyNotCursed").
get fun verifyNotCursed(subject: uint128): bool {
    throw 0xFFFF;
}

get fun owner(): address {
    throw 0xFFFF;
}

get fun pendingOwner(): address? {
    throw 0xFFFF;
}

/// Matches Go binding GetSupportedChains (Name: "getSupportedChains").
get fun getSupportedChains(): lisp_list<uint64> {
    throw 0xFFFF;
}

/// Matches Go binding GetDynamicConfig (Name: "getDynamicConfig").
get fun getDynamicConfig(): TokenPool_DynamicConfig {
    throw 0xFFFF;
}

/// Matches Go binding GetAllowedFinalityConfig (Name: "getAllowedFinalityConfig").
get fun getAllowedFinalityConfig(): uint32 {
    throw 0xFFFF;
}

/// Matches Go binding GetAdvancedPoolHooks (Name: "getAdvancedPoolHooks").
get fun getAdvancedPoolHooks(): address? {
    throw 0xFFFF;
}

/// Matches Go binding GetIsRemotePool (Name: "isRemotePool").
get fun isRemotePool(remoteChainSelector: uint64, remotePoolAddress: Cell<CrossChainAddress>): bool {
    throw 0xFFFF;
}

/// Matches Go binding GetRemoteToken (Name: "getRemoteToken").
get fun getRemoteToken(remoteChainSelector: uint64): Cell<CrossChainAddress> {
    throw 0xFFFF;
}

/// Matches Go binding GetRemotePools (Name: "getRemotePools").
get fun getRemotePools(remoteChainSelector: uint64): lisp_list<Cell<CrossChainAddress>> {
    throw 0xFFFF;
}

/// Matches Go binding GetTokenTransferFeeConfig (Name: "getTokenTransferFeeConfig").
get fun getTokenTransferFeeConfig(destChainSelector: uint64): TokenPool_TokenTransferFeeConfig? {
    throw 0xFFFF;
}

/// Matches Go binding GetCurrentRateLimiterState (Name: "getCurrentRateLimiterState").
get fun getCurrentRateLimiterState(remoteChainSelector: uint64, fastFinality: bool): TokenPool_RateLimiterPair {
    throw 0xFFFF;
}

/// Matches Go binding GetCursedSubjects (Name: "cursedSubjects").
get fun cursedSubjects(): lisp_list<uint128> {
    throw 0xFFFF;
}

/// Matches Go binding GetAdminConfig (Name: "getAdminConfig").
get fun getAdminConfig(): TokenPool_AdminConfig {
    throw 0xFFFF;
}

/// Matches Go binding GetMirroredPolicy (Name: "getMirroredPolicy").
get fun getMirroredPolicy(): TokenPool_MirroredPolicy {
    throw 0xFFFF;
}

/// Matches Go binding GetRemoteChainConfig (Name: "getRemoteChainConfig").
get fun getRemoteChainConfig(remoteChainSelector: uint64): TokenPool_RemoteChainConfig? {
    throw 0xFFFF;
}

/// Matches Go binding GetFee (Name: "getFee").
get fun getFee(
    localToken: address,
    destChainSelector: uint64,
    amount: coins,
    feeToken: address,
    requestedFinalityConfig: uint32,
    tokenArgs: cell?,
): (coins, uint32, uint32, uint16, bool) {
    throw 0xFFFF;
}

/// Matches Go binding GetIsSupportedToken (Name: "isSupportedToken").
get fun isSupportedToken(token: address): bool {
    throw 0xFFFF;
}
