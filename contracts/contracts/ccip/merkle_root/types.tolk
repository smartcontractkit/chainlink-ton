// State stores the general state machine indicating which phase we're in
// TODO: we might be able to merge this into execution_states
const STATE_UNTOUCHED: uint8 = 0;
const STATE_TOKEN_TRANSFER: uint8 = 1;
const STATE_EXECUTE: uint8 = 2;
const STATE_EXECUTE_FAILED: uint8 = 3;
const STATE_SUCCESS: uint8 = 4;



