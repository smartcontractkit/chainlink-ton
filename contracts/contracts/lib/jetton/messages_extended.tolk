struct (0x0f8a7ea5) AskToTransferFwdPayload {
    queryId: uint64
    jettonAmount: coins
    transferRecipient: address
    sendExcessesTo: address
    customPayload: cell?
    forwardTonAmount: coins
    forwardPayload: cell?
}

