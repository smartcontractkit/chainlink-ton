type Msg = Router_CCIPSend | Router_SetRamp | Router_JettonTransferNotification;

struct (0x10000001) Router_SetRamp {
    queryId: uint64;
    // TODO: support onramp and offramp, support list
    destChainSelector: uint64;
    onRamp: address;
}

// TODO should separate CCIPSend msg (with opcode) from CCIPSend data

struct (0x00000001) Router_CCIPSend {
    queryId: uint64;
    destChainSelector: uint64;
    receiver: CrossChainAddress;
    data: cell;
    tokenAmounts: cell; // vec<tokenAmount>
    feeToken: address;
    extraArgs: cell;
}

struct (0x7362d09c) Router_JettonTransferNotification {
    queryId: uint64;
    amount: coins;
    sender: address;
    forwardPayload: Cell<CCIPSend>?; // could also be RemainingBitsAndRefs
}


