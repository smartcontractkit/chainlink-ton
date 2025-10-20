struct Withdrawable {
    reserve: coins;
}

enum Withdrawable_Error {
    // Trying to withdraw more TON than available in balance.
    InsufficientBalance = 28700; // Facility ID * 100
    // Trying to withdraw more TON than available in balance above reserve and force is false.
    HitReserve;
    // Balance is below reserves and force is false.
    LowReserve;
    // Invalid withdrawal request: Amount is non-zero and drain is true or Amount is zero and drain is false.
    InvalidRequest;
}

/// Message for upgrading a contract.
/// 0x0aa811ed == crc32("Withdrawable_Withdraw")
struct (0x0aa811ed) Withdrawable_Withdraw {
    queryId: uint64;
    // address to send TON
    destination: address;
    // Amount to withdraw. Ignored if drain is true.
    amount: coins;
    // Ignore reserve.
    force: bool; 
    // Ignore amount. If force is true, withdraw all balance, otherwise withdraw all balance above reserve.
    drainAllAvailable: bool;
}

fun Withdrawable.withdraw(self, msg: Withdrawable_Withdraw, value: coins) {
    val originalBalance = contract.getOriginalBalance();
    if (msg.drainAllAvailable) {
        assert (msg.amount == 0)throw Withdrawable_Error.InvalidRequest;
        if (msg.force) {
            return _transfer(msg.destination, 0, SEND_MODE_CARRY_ALL_BALANCE); // TODO do we need to add SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE too?
        }
    
        // Withdraw all balance above reserve
        val available = originalBalance - self.reserve;
        assert (available > 0) throw Withdrawable_Error.LowReserve;

        return _transfer(msg.destination, available, SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    }
    // Withdraw specific amount
    assert (msg.amount > 0) throw Withdrawable_Error.InvalidRequest;
    assert (msg.amount < contract.getOriginalBalance()) throw Withdrawable_Error.InsufficientBalance;
    if (msg.force) {
        return _transfer(msg.destination, msg.amount, SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    }
    assert (msg.amount < contract.getOriginalBalance() - self.reserve) throw Withdrawable_Error.HitReserve;
    return _transfer(msg.destination, msg.amount, SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun _transfer(destination: address, value: coins, sendMode: int ) {
    val reply = createMessage({
        bounce: false, // So refund is not returned in case requester doesn't handle empty messages
        value: value,
        dest: destination,
        body: null,
    });
    reply.send(sendMode);
}