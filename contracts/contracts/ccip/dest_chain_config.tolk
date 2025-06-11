import "types.tolk";

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

    chainFamilySelector: uint64;
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
    // validate message came from trusted fee quoter (owner)
}
