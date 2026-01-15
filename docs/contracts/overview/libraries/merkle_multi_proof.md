# Chainlink TON -  MerkleMultiProof

This library implements a Merkle multi-proof verification algorithm. The algorithm takes a list of pre-hashed leaves of the Merkle tree, and a list of already computed proofs for the other subtrees, which can be used to verify the inclusion of the provided leaves.

For more information reference the [EVM implementation](https://github.com/smartcontractkit/chainlink-ccip/blob/main/chains/evm/contracts/libraries/MerkleMultiProof.sol)

## Interface
```
fun merkleRoot<I>(
    leaves: I, // Iterator or TupleIterator<uint256>
    proofs: Iterator<uint256>,
    proofFlagBits: uint256,
): uint256
```
