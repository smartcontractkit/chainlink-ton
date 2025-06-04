# Chainlink TON - Access Control - Ownable2Step

This [trait](https://docs.tact-lang.org/book/types/#traits) implements basic contract onwership as well as a 2-step ownership transfer process.

The implementation is meant to replicate the functionality in [Ownable2Step.sol](https://github.com/smartcontractkit/chainlink-evm/blob/develop/contracts/src/v0.8/shared/access/Ownable2Step.sol).

There are no method modifiers in Tact, so ownership enforcement for a specific message receiver is implemented with the `requireOwner()` function, just like in the native `@stdlib/ownable` trait. 

Example:

```tact
    receive(msg: SetCount) {
        // Use the requireOwner() function from the Ownable2Step trait to only allow the owner to send this message.
        self.requireOwner();

        self.count = msg.newCount;
    }
```

## Interface

This trait supports the `"org.ton.ownable"` interface, and expands it with the ownership transfer functions. The complete interface is identified as `"chainlink.ownable.2step"` and supports the following main receivers and functions:

```tact
/// Requires that the sender of the message is the owner of the contract.
fun requireOwner();

/// Returns the owner of the contract.
get fun owner(): Address;

/// Message sent by the owner to initiate ownership transfer.
receive(msg: TransferOwnership);

/// Message sent by the pending owner to accept ownership.
receive(msg: AcceptOwnership);
```

## Exit codes

The following exit codes could be thrown from these operations:

- `ERROR_ONLY_CALLABLE_BY_OWNER = 132`
- `ERROR_CANNOT_TRANSFER_TO_SELF = 1001`
- `ERROR_MUST_BE_PROPOSED_OWNER = 1002`

The `ERROR_ONLY_CALLABLE_BY_OWNER` exit code number matches the one thrown by the `@stdlib/ownable` trait when `requireOwner()` rejects a message.

## Diagram

![Ownable2Step flow diagram](./ownable_2step.drawio.svg)
