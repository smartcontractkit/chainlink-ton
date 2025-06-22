# Chainlink TON -  MerkleMultiProof

This library implements a Merkle multi-proof verification algorithm. The algorithm takes a list of pre-hashed leaves of the Merkle tree, and a list of already computed proofs for the other subtrees, which can be used to verify the inclusion of the provided leaves. 

Our Tact ipmlementation takes the pre-hashed leaves and proofs as a dictionary simulating an array. It goes over these hashes using a bitmap to guide the execution path and computes the merkle root. The max amount of hashes allowed between the proofs and leaves is 128, that's because we found that larger inputs tend to cross the global gas limit.

For more information reference the [EVM implementation](https://github.com/smartcontractkit/chainlink-ccip/blob/main/chains/evm/contracts/libraries/MerkleMultiProof.sol)

## Interface

```tolk
fun merkleRoot(
    fun merkleRoot(
    leaves: Iterator<uint256>,
    leavesLen: uint16,
    proofs: Iterator<uint256>,
    proofsLen: uint16,
    proofFlagBits: uint256,
): int 256
```

