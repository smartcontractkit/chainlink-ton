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

get fun tokenTransferCost(
    destChainSelector: uint64,
    // TODO: when we allow paying fees in Link, we will need to pass in:
    // feeToken: address,
    // feeTokenPrice: uint224,
    tokenAmounts: SnakedCell<TokenAmount>
) : (uint256, uint32, uint32) {
    val st = lazy Storage.load();
    var tokensIter = tokenAmounts.iter();
    val (count, tokenTransferFeeWei, tokenTransferGas, tokenTransferBytesOverhead) = getTokenTransferCost(st, st.destChainConfigs.mustGet(destChainSelector, FeeQuoter_Error.DestChainNotEnabled as int), mutate tokensIter);
    return (tokenTransferFeeWei, tokenTransferGas, tokenTransferBytesOverhead);
}