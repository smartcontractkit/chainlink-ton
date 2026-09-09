// SPDX-License-Identifier: BUSL-1.1
import "../../../../lib/utils"

const TokenPool_FACILITY_NAME = "link.chain.ton.ccip.pool.TokenPool";
const TokenPool_FACILITY_ID = TokenPool_FACILITY_NAME.crc32() % 640 + 10; // 517

/// Error codes for TokenPool. FACILITY_ID = 517, so codes start at 51700.
enum TokenPool_Error {
    InvalidTransferFeeBps  = TokenPool_FACILITY_ID * 100 // (uint256 bps); // 51700
    InvalidTokenTransferFeeConfig // (uint64 destChainSelector); // 51701
    CallerIsNotARampOnRouter // (address caller); // 51702
    ZeroAddressInvalid // (); // 51703
    NonExistentChain // (uint64 remoteChainSelector); // 51704
    ChainNotAllowed // (uint64 remoteChainSelector); // 51705
    CursedByRMN // (); // 51706
    ChainAlreadyExists // (uint64 chainSelector); // 51707
    InvalidSourcePoolAddress // (bytes sourcePoolAddress); // 51708
    InvalidToken // (address token); // 51709
    Unauthorized // (address caller); // 51710
    PoolAlreadyAdded // (uint64 remoteChainSelector, bytes remotePoolAddress); // 51711
    InvalidRemotePoolForChain // (uint64 remoteChainSelector, bytes remotePoolAddress); // 51712
    InvalidRemoteChainDecimals // (bytes sourcePoolData); // 51713
    OverflowDetected // (uint8 remoteDecimals, uint8 localDecimals, uint256 remoteAmount); // 51714
    InvalidDecimalArgs // (uint8 expected, uint8 actual); // 51715
    CallerIsNotOwnerOrFeeAdmin // (address caller); // 51716
    UnsupportedOperation // (); // 51717

    // TODO: extra
    MissingForwardPayload // 51718
    MissingTransferInitiator // 51719
    AmountMismatch // 51720
    InvalidRequestedFinality // 51721
    RateLimitExceeded // 51722
}
