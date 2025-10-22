// State stores the general state machine indicating which phase we're in
// TODO: we might be able to merge this into execution_states
enum ReceiveExecutor_MessageState {
    Untouched = 0;
    TokenTransfer;
    Execute ;
    ExecuteFailed;
    Success;
}
