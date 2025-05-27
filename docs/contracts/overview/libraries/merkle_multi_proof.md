# Chainlink TON -  MerkleMultiProof

This library implements a Merkle multi-proof verification algorithm. The algorithm takes a list of pre-hashed leaves of the Merkle tree, and a list of already computed proofs for the other subtrees, which can be used to verify the inclusion of the provided leaves. 

Our Tact ipmlementation takes the pre-hashed leaves and proofs as a dictionary simulating an array. It goes over these hashes using a bitmap to guide the execution path and computes the merkle root. The max amount of hashes allowed between the proofs and leaves is 128, that's because we found that larger inputs tend to cross the global gas limit.

For more information reference the [EVM implementation](https://github.com/smartcontractkit/chainlink-ccip/blob/main/chains/evm/contracts/libraries/MerkleMultiProof.sol)

## Benchmarking of different implementations

Data extracted from different snapshots of the Merkle multi-proof verification algorithm implementation. 

These are the values of gas measured for two benchmarks, an input with 128 leaves and no proofs, and an input with 10 leaves and 33 proofs (43 input hashes).

Two contract implementations of the algorithm where benchmarked, `MerkleMultiProof_Dict` which uses `Map<Int as uin16, Int as uint256>` to simulate an Array (recommended by the tact documentation), and `MerkleMultiProof_List` which uses a linked list of cells, where each node is a cell containing 3 32byte hashes and a reference to the next node in the list. 
```
┌───────────────────────────┬──────────────┬──────────────┬───────────────────────────────────┬─────────────────────────────────────┐
│                           │              │              │              keccak256            │               sha256                │
│         Contract          │   Benchmark  │    Method    ├─────────────┬─────────┬───────────┼───────────────┬─────────┬───────────┤
│                           │              │              │   gasUsed   │  cells  │   bits    │    gasUsed    │  cells  │   bits    │
├───────────────────────────┼──────────────┼──────────────┼─────────────┼─────────┼───────────┼───────────────┼─────────┼───────────┤
│ MerkleMultiProof_Dict     │              │              │             │         │           │               │         │           │
│                           │      A       │  merkleRoot  │ 834486      │ 10      │ 4411      │ 833724        │ 10      │ 4411      │
├───────────────────────────┤  128 leaves  ├──────────────┼─────────────┼─────────┼───────────┼───────────────┼─────────┼───────────┤
│ MerkleMultiProof_Lists    │              │              │             │         │           │               │         │           │
│                           │              │  merkleRoot  │ 864206      │ 13      │ 4707      │ 863444        │ 13      │ 4707      │
├───────────────────────────┼──────────────┼──────────────┼─────────────┼─────────┼───────────┼───────────────┼─────────┼───────────┤
│ MerkleMultiProof_Dict     │      B       │              │             │         │           │               │         │           │
│                           │ "Spec Sync"  │  merkleRoot  │ 262937      │ 10      │ 4331      │ 262703        │ 10      │ 4331      │
│───────────────────────────┤  (10 leaves, ├──────────────┼─────────────┼─────────┼───────────┼───────────────┼─────────┼───────────┤
│ MerkleMultiProof_Lists    │  33 proofs)  │              │             │         │           │               │         │           │
│                           │              │  merkleRoot  │ 275997      │ 13      │  4707     │ 275763        │ 13      │  4707     │
└───────────────────────────┴──────────────┴──────────────┴─────────────┴─────────┴───────────┴───────────────┴─────────┴───────────┘
```

When going from the linked lists to the dictionary implementation of the algorithm, considering the keccak implementation
- For `Benchmark_A`, a `3.4%` reduction of gas cost is observed, `29720 gas units`.
- For `Benchmark_B` a `4.7%` reduction of gas cost is observed, `13060 gas units`. 

When going from the keccak256 to sha256 implementation of the algorithm, considering the dictionary implementation:
- For `Benchmark_A`, a  `0.09%` reduction of gas cost is observed, `762 gas units`.
- For `Benchmark_B`, a ` 0.09%` reduction of gas cost is also observed, `234 gas units`.

Most of the cost of the function seems to stem from having to initialize and parse such a big input, and for the cells intialization needed to store the intermediate hashes involved in the algorithm. The primitives to initialize, build, and parse cells are much more gas expensive than any other operations provided by the TVM. This is the reason why these changes in implementation detail have a small impact on the actual total gas cost. -[TVM gas costs documentation](https://docs.ton.org/v3/documentation/smart-contracts/transaction-fees/fees-low-level#tvm-instructions-cost)-.

We can also observe that both for the linked lists and dicitonary implemementations of the algorithm, the gas difference when going from keccak256 to sha256 is the same, this comes from the fact that both implementations do the same amount of hashing operations.

## Gas cost of hashing operations

Inspecting the transpiled funC code, we can see that the following assembly operations are invoked to calculate the hash of a slice  `HASHEXT_SHA256` and `HASHEXT_KECCAK256` -depending on which function is used-, with a gas cost of `1/33 gas per byte` and `1/11 gas per byte` respectively according to the TVM documentation. 

On the Merkle multi-proof algorithm, on each step, the concatenation of two 32byte nodes of data and an internal 32byte separator is hashed using this algorithm. Which means on each step, a hashing operation is done over 96 bytes. The algorithm always takes the same `totalHashes` amount of steps which equals `leaves + proofs - 1`. 

For `Benchmark_A` this means `totalHashes = 127` and for `Benchmark_B` `totalHashes = 42`.

Then, we can estimate how much gas the hashing operations consume. The amount should be the same no matter how the input is structured.

For ` Benchmark_A`:
- `estimated_cost_sha =  1/33 * 96 * 127 = 369.5 gas units`
- `estimated_cost_keccak =  1/11 * 96 * 127 = 1108.4 gas units`
- `estimated_difference = 1108.4 - 369.5 = 738.9 gas units`

For ` Benchmark_B`:
- `estimated_cost_sha =  1/33 * 96 * 42 = 122.1 gas units`
- `estimated_cost_keccak =  1/11 * 96 * 42 = 366.5 gas units`
- `estimated_difference = 366.5 - 122.1 = 244.4 gas units`

Actual gas cost difference when using Keccak256 or SHA256:
- For `Benchmark A` we see that the actual value difference  is around `762 gas units`.
- For `Benchmark B` the actual difference is around `234 gas units`.

We can see that the obtained gas cost results approximate the estimated gas amount pretty well.

### Conclusions

Most of the gas cost for this algorithm comes from the size of the input, which must be loaded in memory and the amount of cells that need to be initialized. 
 
Accessing elements via map.get(index) seems to be more efficient than manually parsing cell structures. This operation involves TVM dictionary operations, while these also traverse cell structures (Patricia trees), they are often more optimized for collections, and the TVM might benefit from internal caching or more efficient traversal paths, especially for sequential integer keys

The gas cost of the keccack256 algorithm being 3 times the one of the sha256 per byte is not as significant as it looks in algorithms that need to initialize memory space for computation. In the cases where a really big input needs to be hashed, the cost of initializing and parsing this big input is much higher than that of actually performing the gas operation. 

Based on these results, the implementation using dictionaries and the sha256 algorithm will be used.
