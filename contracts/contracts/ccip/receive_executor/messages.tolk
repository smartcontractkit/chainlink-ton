import "../offramp/messages"

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

const RECEIVE_EXECUTOR_COSTS_CONFIRMED_OR_BOUNCED_FEE = ton("0.007");
const RECEIVE_EXECUTOR_COSTS_INIT_EXEC_FEE = ton("0.004");

struct ReceiveExecutor_Costs{}

fun ReceiveExecutor_Costs.initExec(){
    val baseFee = RECEIVE_EXECUTOR_COSTS_INIT_EXEC_FEE;
    return baseFee + OffRamp_Costs.dispatchValidated();
}

fun ReceiveExecutor_Costs.confirmedOrBounced() {
    val baseFee = RECEIVE_EXECUTOR_COSTS_CONFIRMED_OR_BOUNCED_FEE;
    return baseFee + OffRamp_Costs.notify();
}


