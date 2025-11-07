import "../../fee_quoter/contract"
import "../../fee_quoter/storage"
import "../../fee_quoter/errors"
import "../../../lib/utils"
import "../../common/types"

get fun dataAvailabilityCost(
    destChainSelector: uint64,
    dataAvailabilityGasPrice: uint112,
    calldataLen: uint256,
    tokenCount: uint256,
    tokenTransferBytesOverhead: uint256,
): uint256 {
    val st = lazy Storage.load();

    val destChainConfig = st.destChainConfigs.mustGet(destChainSelector, FeeQuoter_Error.DestChainNotEnabled as int);
    return _dataAvailabilityCost(
        destChainConfig,
        dataAvailabilityGasPrice,
        calldataLen,
        tokenCount,
        tokenTransferBytesOverhead,
    );
}