import "../lib/merkle_multi_proof/merkle_multi_proof.tact";

/// @notice Leaf domain separator, should be used as the first 32 bytes of leaf node's preimage.
// TODO: Use for impleenting leaf hashing function
const LEAF_DOMAIN_SEPARATOR: Int = 0x0000000000000000000000000000000000000000000000000000000000000000;

message MerkleMultiProof {
    queryId: Int as uint64;
    leaves: map<Int as uint16, Int as uint256>;
    leavesLen: Int as uint16;
    proofs: map<Int as uint16, Int as uint256>;
    proofsLen: Int as uint16;
    proofFlagBits: Int as uint256;
}

/// An example contract is necessary for testing and compiling the MerkleMultiProof library.
contract MerkleMultiProofCalculator {
    root: Int as uint256 = 0;

    receive(proof: MerkleMultiProof) {
        let res = merkleRoot(
            proof.leaves,
            proof.leavesLen,
            proof.proofs,
            proof.proofsLen,
            proof.proofFlagBits,
        );
        self.root = res;
    }

    get fun getRoot(): Int {
        return self.root;
    }
}
