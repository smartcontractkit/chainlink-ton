struct TokenBalance {
    amount: coins = 0;
    failed: bool = false; // if marked as failed, a retry will allow re-sending these
}
