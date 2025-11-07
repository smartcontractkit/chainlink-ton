type ReceiveExecutor_InMessage = ReceiveExecutor_InitExecute | ReceiveExecutor_Bounced | ReceiveExecutor_Confirm;

//crc32('ReceiveExecutor_InitExecute')
struct (0x64cd2fd2) ReceiveExecutor_InitExecute {
    gasOverride: coins? = null;
}

//crc32('ReceiveExecutor_Confirm')
struct (0x00e5dd97) ReceiveExecutor_Confirm {
    receiver: address
}

//crc32('ReceiveExecutor_Bounced')
struct (0x05dee1bb) ReceiveExecutor_Bounced {
    receiver: address
}
