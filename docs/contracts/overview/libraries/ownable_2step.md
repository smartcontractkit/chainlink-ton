# Chainlink TON - Access Control - Ownable2Step Module

This document describes a module that implements basic contract ownership, including a 2-step ownership transfer process. It is designed for use in Tolk smart contracts.

The implementation is meant to replicate the functionality found in [Ownable2Step.sol](https://github.com/smartcontractkit/chainlink-evm/blob/develop/contracts/src/v0.8/shared/access/Ownable2Step.sol) from the EVM Chainlink repository.

### Overview: The "Struct as a Trait" Pattern

Since Tolk v0.99 does not support native inheritance or traits, we use a composability pattern based on structs and extension functions. This `Ownable2Step` module encapsulates its state and logic within a struct, which can then be embedded into your main contract's state.

-   **State:** The core data (`owner` and `pendingOwner`) is held in the `Ownable2Step` struct.
-   **Functionality:** Logic for handling messages and ownership checks is implemented as extension functions that operate on this struct (e.g., `fun Ownable2Step.onInternalMessage(...)`).

This approach allows for modular, readable, and maintainable code by composing independent functional units.

### How to Use

To integrate this module, you embed the Ownable2Step struct into your contract's state and route messages through its handlers. The following OwnableCounter contract provides a complete example.

1. Embed the Struct in Your Contract's State
First, define your contract's storage struct and include Ownable2Step as a field. It's also common practice to have helper functions for loading and saving state.

``` tolk
import "./../lib/access/ownable_2step.tolk";

struct OwnableCounter {
    id: uint64;
    count: uint32;
    ownable: Ownable2Step; // Embed the module's struct
}

// Helper to load contract data using auto-deserialization
fun loadData(): OwnableCounter {
    return OwnableCounter.fromCell(contract.getData());
}

// Helper to save contract data using auto-serialization
fun saveData(data: OwnableCounter) {
    contract.setData(data.toCell());
}
```

2. Delegate Messages in the Main Receiver
In your main onInternalMessage function, load the contract's state. Then, give the Ownable2Step module the first chance to handle the message by calling its onInternalMessage function. If it handles the message (returns true), save the potentially modified state and exit.

``` tolk
// Your contract's message types
struct (0x00000001) SetCount { /* ... */ }
type IncomingMessage = SetCount;

fun onInternalMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    if (msgBody.isEnd()) { // Ignore all empty messages
        return;
    }

    var storage = loadData();

    // 1. Try to handle as an Ownable2Step message first.
    // This handles TransferOwnership and AcceptOwnership messages.
    var handled = storage.ownable.onInternalMessage(myBalance, msgValue, msgFull, msgBody);

    if (handled) {
        // The module's handler might have changed the owner, so we must save.
        saveData(storage);
        return;
    }
    
    // 2. If not handled, proceed with your contract's specific logic.
    // (See next step)
    // ...
}
```

3. Protect Your Message Handlers
For your contract's own messages that require owner-only access, you must manually parse the sender's address and call the requireOwner function.

Continuing the onInternalMessage function from the previous step:

``` tolk
    // ... after the 'if (handled)' block

    val msg = IncomingMessage.fromSlice(msgBody);

    match(msg) {
        SetCount => {
            // Get the sender address from the full message cell
            var cs: slice = msgFull.beginParse();
            _ = cs.loadMessageFlags(); // Skip flags
            var sender: address = cs.loadAddress();

            // Enforce that the sender is the owner
            storage.ownable.requireOwner(sender);

            // Proceed with state change
            storage.count = msg.count;
            saveData(storage);
        }
    }
}
```

4. Expose Getters (Optional)
You can provide convenient top-level getters on your contract that retrieve data from the Ownable2Step module.

``` tolk
get owner(): address {
    var storage = loadData();
    // Delegate the call to the module's getter
    return storage.ownable.get_owner();
}

get counter(): uint32 {
    var storage = loadData();
    return storage.count;
}
```

### API Reference

#### State Struct

This is the core struct that holds the ownership state.

```tolk
struct Ownable2Step {
    owner: address;
    pendingOwner: address?;
}
```

#### Message Handlers

The module exposes a single message handler, `onInternalMessage`, which processes the following messages.

| Message                        | Opcode       | Description                                        |
| ------------------------------ | ------------ | -------------------------------------------------- |
| `Ownable2Step_TransferOwnership` | `0xF21B7DA1` | Initiates an ownership transfer to a `newOwner`.   |
| `Ownable2Step_AcceptOwnership`   | `0xF9E29E4A` | Sent by the pending owner to accept the ownership. |

---

**`fun Ownable2Step.onInternalMessage(mutate self, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice): bool`**

This function should be called from your contract's `recv_internal`. It parses `msgBody` and, if the message matches an `Ownable2Step` message, it executes the corresponding logic (`transferOwnership` or `acceptOwnership`).

- **Returns:** `true` if the message was an `Ownable2Step` message and was handled, `false` otherwise.

#### Internal Functions

These are the core logic functions used to manage ownership.

**`fun Ownable2Step.requireOwner(self, sender: address)`**
Requires that the `sender` of the message is the current contract owner. Throws `ERROR_ONLY_CALLABLE_BY_OWNER` on failure.

**`fun Ownable2Step.transferOwnership(mutate self, sender: address, to: address)`**
Initiates the ownership transfer by setting the `pendingOwner`. This can only be called by the current `owner`.

**`fun Ownable2Step.acceptOwnership(mutate self, sender: address)`**
Finalizes the ownership transfer. This must be called by the address set as `pendingOwner`.

#### Getter Functions

These functions provide external read-only access to the module's state.

**`fun Ownable2Step.get_owner(self): address`**
Returns the current owner of the contract.

**`fun Ownable2Step.get_pendingOwner(self): address?`**
Returns the pending owner, if one has been proposed.

### Exit Codes

The following exit codes can be thrown by this module's operations:

| Code | Constant                        | Description                                                                  |
| ---- | ------------------------------- | ---------------------------------------------------------------------------- |
| 132  | `ERROR_ONLY_CALLABLE_BY_OWNER`    | The message sender is not the contract owner. Matches the standard library.  |
| 1001 | `ERROR_CANNOT_TRANSFER_TO_SELF`   | The proposed new owner is the same as the current owner.                     |
| 1002 | `ERROR_MUST_BE_PROPOSED_OWNER`    | The sender of `AcceptOwnership` is not the pending owner.                      |
