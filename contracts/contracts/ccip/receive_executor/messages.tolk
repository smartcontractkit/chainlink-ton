type ReceiveExecutor_InMessage = ReceiveExecutor_InitExecute | ReceiveExecutor_Bounced | ReceiveExecutor_Confirm;

//TODO crc32('CCIPReceiveExecutor_InitExecute')
struct (0x66776677) ReceiveExecutor_InitExecute {
}

//TODOcrc32('CCIPReceiveExecutor_CCIPReceiveConfirm')
struct (0x88998899) ReceiveExecutor_Confirm {
    receiver: address
}

//TODO crc32('CCIPReceiveExecutor_CCIPReceiveBounced')
struct (0x59059059) ReceiveExecutor_Bounced {
    receiver: address
}
