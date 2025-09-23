// State stores the general state machine indicating which phase we're in
// TODO: we might be able to merge this into execution_states

enum State {
    Untouched;
    TokenTransfer;
    Execute;
    ExecuteFailed;
    Success;
}

struct TokenBalance {
    amount: coins = 0;
    failed: bool = false; // if marked as failed, a retry will allow re-sending these
}


