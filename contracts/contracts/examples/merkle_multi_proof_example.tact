import "../libraries/merkle_multi_proof.tact";

/// An example contract is necessary for testing and compiling the MerkleMultiProof library.

message MerkleMultiProof {
    leaves: map<Int as uint16, Int as uint256>;
    leavesLen: Int as uint16;
    proofs: map<Int as uint16, Int as uint256>;
    proofsLen: Int as uint16;
    proofFlagBits: Int as uint256;
}

contract MerkleMultiProofCalculator {
    root: Int as uint256 = 0;
    receive(proof: MerkleMultiProof) {
        let res = merkleRoot(
             proof.leaves,
             proof.leavesLen,
             proof.proofs,
             proof.proofsLen,
             proof.proofFlagBits
         ); 
         self.root = res;
    }

    get fun getRoot(): Int {
        return self.root;
    }
}
