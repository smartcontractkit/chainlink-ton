// SPDX-License-Identifier: BUSL-1.1
import "../../lib/utils"

const TokenPool_FACILITY_NAME = "link.chain.ton.ccip.TokenPool";
const TokenPool_FACILITY_ID = 149;  // (crc32(<facility>) % 640) + 10

enum TokenPool_Error {
    InvalidTransferFeeBps  = TokenPool_FACILITY_ID * 100 // (uint256 bps);
    InvalidTokenTransferFeeConfig // (uint64 destChainSelector);
    CallerIsNotARampOnRouter // (address caller);
    ZeroAddressInvalid // ();
    NonExistentChain // (uint64 remoteChainSelector);
    ChainNotAllowed // (uint64 remoteChainSelector);
    CursedByRMN // ();
    ChainAlreadyExists // (uint64 chainSelector);
    InvalidSourcePoolAddress // (bytes sourcePoolAddress);
    InvalidToken // (address token);
    Unauthorized // (address caller);
    PoolAlreadyAdded // (uint64 remoteChainSelector, bytes remotePoolAddress);
    InvalidRemotePoolForChain // (uint64 remoteChainSelector, bytes remotePoolAddress);
    InvalidRemoteChainDecimals // (bytes sourcePoolData);
    OverflowDetected // (uint8 remoteDecimals, uint8 localDecimals, uint256 remoteAmount);
    InvalidDecimalArgs // (uint8 expected, uint8 actual);
    CallerIsNotOwnerOrFeeAdmin // (address caller);
    UnsupportedOperation // ();

    // TODO: extra
    MissingForwardPayload
    MissingTransferInitiator
    AmountMismatch
    InvalidRequestedFinality
    RateLimitExceeded
}

@inline
fun TokenPool_errorCode(local: uint16): uint16 {
    return getErrorCode("link.chain.ton.ccip.TokenPool".crc32(), local);
}
