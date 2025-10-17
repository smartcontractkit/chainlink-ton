type ReceiveExecutor_InMessage = ReceiveExecutor_InitExecute | ReceiveExecutor_Bounced | ReceiveExecutor_Confirm;

//TODO crc32('CCIPReceiveExecutor_InitExecute')
struct (0x38ede91) ReceiveExecutor_InitExecute {
}

//TODOcrc32('CCIPReceiveExecutor_CCIPReceiveConfirm')
struct (0x81650c13) ReceiveExecutor_Confirm {
    receiver: address
}

//TODO crc32('CCIPReceiveExecutor_CCIPReceiveBounced')
struct(0x845e303f) ReceiveExecutor_Bounced {
    receiver: address
}
