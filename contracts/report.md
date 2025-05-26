Data extracted from different snapshots of the Merkle multi-proof verification algorithm implementation. 

The methods 0x20adafbb and 0x77986868 correspond to the message receiver for verifying the multiproof using a dictionary or a linked list of cells to represent the input of leaves and proofs for the multiproof. 

These are the values of gas measured for two benchmarks, an input with 128 leaves and no proofs, and an input with 10 leaves and 33 proofs (43 input hashes).
┌───────────────────────────┬──────────────┬──────────────┬───────────────────────────────────┬─────────────────────────────────────┐
│                           │              │              │              keccak256            │               sha256                │
│         Contract          │   Benchmark  │    Method    ├─────────────┬─────────┬───────────┼───────────────┬─────────┬───────────┤
│                           │              │              │   gasUsed   │  cells  │   bits    │    gasUsed    │  cells  │   bits    │
├───────────────────────────┼──────────────┼──────────────┼─────────────┼─────────┼───────────┼───────────────┼─────────┼───────────┤
│                           │              │     send     │  1937       │ 10      │ 4411      │   1937        │ 10      │ 4411      │
│ MerkleMultiProof_Dict     │              ├──────────────┼─────────────┼─────────┼───────────┼───────────────┼─────────┼───────────┤
│                           │              │  0x20adafbb  │ 834486      │ 10      │ 4411      │ 833724        │ 10      │ 4411      │
├───────────────────────────┤  128 leaves  ├──────────────┼─────────────┼─────────┼───────────┼───────────────┼─────────┼───────────┤
│                           │              │     send     │  1937       │ 13      │ 4707      │   1937        │ 13      │ 4707      │
│ MerkleMultiProof_Lists    │              ├──────────────┼─────────────┼─────────┼───────────┼───────────────┼─────────┼───────────┤
│                           │              │  0x77986868  │ 864206      │ 13      │ 4707      │ 863444        │ 13      │ 4707      │
├───────────────────────────┼──────────────┼──────────────┼─────────────┼─────────┼───────────┼───────────────┼─────────┼───────────┤
│                           │              │     send     │   1937      │ 10      │ 4331      │   1937        │ 10      │ 4331      │
│ MerkleMultiProof_Dict     │              ├──────────────┼─────────────┼─────────┼───────────┼───────────────┼─────────┼───────────┤
│                           │              │  0x20adafbb  │ 262937      │ 10      │ 4331      │ 262703        │ 10      │ 4331      │
│───────────────────────────┤  Spec Sync   ├──────────────┼─────────────┼─────────┼───────────┼───────────────┼─────────┼───────────┤
│                           │              │     send     │   1937      │ 13      │  4707     │   1936        │ 13      │  4707     │
│ MerkleMultiProof_Lists    │  (10 leaves, ├──────────────┼─────────────┼─────────┼───────────┼───────────────┼─────────┼───────────┤
│                           │  33 proofs)  │  0x77986868  │ 275997      │ 13      │  4707     │ 275763        │ 13      │  4707     │
└───────────────────────────┴──────────────┴──────────────┴─────────────┴─────────┴───────────┴───────────────┴─────────┴───────────┘

For the input with 128 leaves and no proofs, this means 127 hashing operations. Each hasing operations is done over the concatenation of the two nodes involved on the calculation and an internal separator, each of these is 32bytes long which means each hashing operation is done over 96 bytes. 

Inspecting the transpiled funC code, we can see that for calculating the hash of a slice, the following assembly operations are invoked `HASHEXT_SHA256` and `HASHEXT_KECCAK256` -depending on which function is used-. The gas cost for the is `1/33 gas per byte` and `1/11 gas per byte` respectively. Estimating the gas cost from these hashing operations we get the following results:

- `1/33 * 96 * 127 = 369.5 gas units`
- `1/11 * 96 * 127 = 1108.4 gas units`

So, the difference in gas units between one implementation and the other should be around `1108 - 369 = 739 gas units` when changing from one hashing operation to the other. Analyzing the obtained data for this test case we see that the value differs by `762 gas units` which is on the order of the expected value.

When implementing the algorithm using dictionaries instead of linked lists, the gas cost is reduced by around 3.4%, this is probably due to bad manual handling of Cells in the implementation using linked lists, operations for creating and parsing cells have a high gas cost and simple mistakes can drive up the cost -[TVM gas costs documentation](https://docs.ton.org/v3/documentation/smart-contracts/transaction-fees/fees-low-level#tvm-instructions-cost)-.

These amounts though, are relatively insignificant with respect to the actual gas cost of executing the methods. Most of the cost seems to stem from having to initialize and parse such a big input.

