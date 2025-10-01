type Msg = CCIPSend | SetRamps | Common_JettonTransferNotification;

// update multiple chain selectors in batch to the same onramp address
struct (0x10000001) SetRamps {
    // TODO: support onramp and offramp, support list
    queryId: uint64;
    destChainSelectors: cell; // vec<uint64> for destChainSelectors
    onRamp: address;
}

// TODO should separate CCIPSend msg (with opcode) from CCIPSend data

struct (0x00000001) CCIPSend {
    queryId: uint64;
    destChainSelector: uint64;
    receiver: CrossChainAddress;
    data: cell;
    tokenAmounts: cell; // vec<tokenAmount>
    feeToken: address;
    extraArgs: cell;
}

