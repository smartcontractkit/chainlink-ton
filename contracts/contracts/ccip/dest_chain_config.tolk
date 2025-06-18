import "types.tolk";

// This represents FeeQuoter's DestChainConfig (not OnRamp)

const CHAIN_FAMILY_SELECTOR_EVM: uint32 = 0x2812d52c;
const CHAIN_FAMILY_SELECTOR_SVM: uint32 = 0x1e10bdc4;
const CHAIN_FAMILY_SELECTOR_APTOS: uint32 = 0xac77ffec;
const CHAIN_FAMILY_SELECTOR_SUI: uint32 = 0xc4e05953;

struct Storage {
    owner: address;

    isEnabled: bool;
    maxNumberOfTokensPerMsg: uint16;
    maxDataBytes: uint32;
    maxPerMsgGasLimit: uint32;
    destGasOverhead: uint32;
    destGasPerPayloadByteBase: uint8;
    destGasPerPayloadByteHigh: uint8;
    destGasPerPayloadByteThreshold: uint16;
    destDataAvailabilityOvrheadGas: uint32;
    destGasPerDataAvailabilityByte: uint16;
    destDataAvailabilityMultiplierBps: uint32;

    chainFamilySelector: uint32; // 4 bytes
    enforceOutOfOrder: bool;

    defaultTokenFeeUsdCents: uint16;
    defaultTokenDestGasOverhead: uint32;
    defaultTxGasLimit: uint32;

    // Multiplier for gas costs, 1e18 based so 11e17 = 10% extra cost.
    gasMultiplierWeiPerEth: uint64;
    gasPriceStalenessThreshold: uint32;
    networkFeeUsdCents: uint32;

    tokenTransferFeeConfigs: dict; // (sdict) address -> TokenTransferFeeConfig
}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}

struct TokenTransferFeeConfig {
    isEnabled: bool;
    minFeeUsdCents: uint32;
    maxFeeUsdCents: uint32;
    deciBps: uint16;
    destGasOverhead: uint32;
    destBytesOverhead: uint32;
}

fun onInternalMessage(msgCell: cell, msgBody: slice) {
}

fun onGetValidatedFee(msg: CCIPSend) {
    val cfg = Storage.load();
    // validate message came from trusted fee quoter (owner)

    assert(cfg.isEnabled, ERROR_DEST_CHAIN_NOT_ENABLED);
    // TODO: assert(cfg.feeTokens contains msg.feeToken, ERROR_FEE_TOKEN_NOT_SUPPORTED);

    // NOTE: we could deploy distinct contracts to cut down on code
    match (cfg.chainFamilySelector) {
        CHAIN_FAMILY_SELECTOR_EVM | CHAIN_FAMILY_SELECTOR_APTOS | CHAIN_FAMILY_SELECTOR_SUI => { } // resolveGenericGasLimit()
        CHAIN_FAMILY_SELECTOR_SVM => { } // resolveSVMGasLimit()
    }

    // validateDestFamilyAddress(cfg.chainFamilySelector, receiver, gasLimit);

    // getTokenTransferCost()
    // getDataAvailabilityMultiplier()

    // return (gas, data availability cost usd)
}
