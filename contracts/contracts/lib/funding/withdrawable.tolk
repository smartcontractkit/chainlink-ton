// SPDX-License-Identifier: MIT
tolk 1.4.2

import "@stdlib/gas-payments"

const Withdrawable_FACILITY_NAME = "link.chain.ton.lib.funding.Withdrawable";
const Withdrawable_FACILITY_ID = Withdrawable_FACILITY_NAME.crc32() % 640 + 10;  // 571
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

const Withdrawable_ERROR_CODE = Withdrawable_FACILITY_ID * 100;

struct Withdrawable {
    reserve: coins;
}

enum Withdrawable_Error {
    // Trying to withdraw more TON than available in balance.
    InsufficientBalance = Withdrawable_ERROR_CODE; // 57100,
    // Trying to withdraw more TON than available in balance above reserve.
    HitReserve;
    // Invalid withdrawal request: Amount is non-zero and drain is true or Amount is zero and drain is false.
    InvalidRequest;
}

// Withdraw TON from the contract balance.
struct (0xf343fc1b) Withdrawable_Withdraw {
    queryId: uint64;
    // address to send TON
    destination: address;
    // Amount to withdraw. Ignored if drain is true.
    amount: coins;
    // Overwrite reserve.
    reserve: coins?; 
    // Ignore amount. If force is true, withdraw all balance, otherwise withdraw all balance above reserve.
    drainAllAvailable: bool;
}

fun Withdrawable.withdraw(self, msg: Withdrawable_Withdraw) {
    val originalBalance = contract.getOriginalBalance();
    var actualReserve = self.reserve;
    if (msg.reserve != null) {
        actualReserve = msg.reserve;
    }
    if (msg.drainAllAvailable) {
        assert (msg.amount == 0) throw Withdrawable_Error.InvalidRequest;    
        // Withdraw all balance above reserve
        assert (originalBalance > actualReserve) throw Withdrawable_Error.HitReserve;
        reserveGramsOnBalance(actualReserve, RESERVE_MODE_EXACT_AMOUNT);

        return _transfer(msg.destination, 0, SEND_MODE_CARRY_ALL_BALANCE);
    }
    // Withdraw specific amount
    assert (msg.amount > 0) throw Withdrawable_Error.InvalidRequest;
    assert (msg.amount < originalBalance) throw Withdrawable_Error.InsufficientBalance;
    assert (msg.amount < originalBalance - actualReserve) throw Withdrawable_Error.HitReserve;
    return _transfer(msg.destination, msg.amount, SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Safe withdrawal for long-lived contracts that must preserve a rent reserve.
/// Unlike `withdraw`, it adds the current storage due to the reserve, never lets the caller lower
/// the configured floor, and does not carry inbound value on the fixed-amount path.
fun Withdrawable.withdrawSafe(self, msg: Withdrawable_Withdraw) {
    val floor = self.reserve + contract.getStorageDuePayment();
    val actualReserve = msg.reserve == null ? floor : max(floor, msg.reserve!) as coins;
    val originalBalance = contract.getOriginalBalance();

    if (msg.drainAllAvailable) {
        assert(msg.amount == 0) throw Withdrawable_Error.InvalidRequest;
        assert(originalBalance > actualReserve) throw Withdrawable_Error.HitReserve;
        reserveGramsOnBalance(actualReserve, RESERVE_MODE_EXACT_AMOUNT);
        return _transfer(msg.destination, 0, SEND_MODE_CARRY_ALL_BALANCE);
    }

    assert(msg.amount > 0) throw Withdrawable_Error.InvalidRequest;
    assert(originalBalance > actualReserve) throw Withdrawable_Error.HitReserve;

    val transfer = createMessage({
        bounce: false,
        value: msg.amount,
        dest: msg.destination,
        body: createEmptyCell(),
    });
    val fee = transfer.estimateFeeWithoutSending(SEND_MODE_PAY_FEES_SEPARATELY);
    assert(msg.amount + fee <= originalBalance - actualReserve) throw Withdrawable_Error.InsufficientBalance;

    reserveGramsOnBalance(actualReserve, RESERVE_MODE_EXACT_AMOUNT);
    transfer.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun _transfer(destination: address, value: coins, sendMode: int ) {
    val reply = createMessage({
        bounce: false, // So refund is not returned in case requester doesn't handle empty messages
        value,
        dest: destination,
        body: createEmptyCell(),
    });
    reply.send(sendMode);
}