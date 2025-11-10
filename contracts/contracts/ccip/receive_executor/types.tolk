// State stores the general state machine indicating which phase we're in
enum ReceiveExecutor_MessageState {
    Untouched = 0;
    TokenTransfer;
    Execute ;
    ExecuteFailed;
    Success;
}
