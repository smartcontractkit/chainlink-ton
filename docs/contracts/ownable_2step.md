# Chainlink TON - Access Control - Ownable2Step

This [trait](https://docs.tact-lang.org/book/types/#traits) implements contract onwership as well as basic 2-step ownership transfer.

The implementation is meant to replicate the functionality in [Ownable2Step.sol](https://github.com/smartcontractkit/chainlink-evm/blob/develop/contracts/src/v0.8/shared/access/Ownable2Step.sol).

There are no method modifiers in Tact, so ownership enforcement for a specific message receiver is implemented with the `requireOwner()` function, just like in the native `@stdlib/ownable` trait.



