import "../offramp/messages"

type ReceiveExecutor_InMessage =
    | ReceiveExecutor_InitExecute
    | ReceiveExecutor_Bounced
    | ReceiveExecutor_Confirm
    | ReceiveExecutor_Freeze;

struct (0x64cd2fd2) ReceiveExecutor_InitExecute {
    gasOverride: coins? = null;
}

struct (0x00e5dd97) ReceiveExecutor_Confirm {
    receiver: address
}

struct (0x05dee1bb) ReceiveExecutor_Bounced {
    receiver: address
}

struct (0x1571d8c6) ReceiveExecutor_Freeze {}

const RECEIVE_EXECUTOR_COSTS_CONFIRMED_OR_BOUNCED_FEE = ton("0.007");
const RECEIVE_EXECUTOR_COSTS_INIT_EXEC_FEE = ton("0.004");

struct ReceiveExecutor_Costs{}

fun ReceiveExecutor_Costs.initExec(): int {
    val baseFee = RECEIVE_EXECUTOR_COSTS_INIT_EXEC_FEE;
    return baseFee + OffRamp_Costs.dispatchValidated();
}

fun ReceiveExecutor_Costs.confirmedOrBounced(): int {
    val baseFee = RECEIVE_EXECUTOR_COSTS_CONFIRMED_OR_BOUNCED_FEE;
    return baseFee + OffRamp_Costs.notify();
}
