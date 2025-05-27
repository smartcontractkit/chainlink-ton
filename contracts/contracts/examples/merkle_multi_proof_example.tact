import "../libraries/merkle_multi_proof.tact";

message MerkleMultiProof {
    leaves: map<Int as uint16, Int as uint256>;
    leavesLen: Int as uint16;
    proofs: map<Int as uint16, Int as uint256>;
    proofsLen: Int as uint16;
    proofFlagBits: Int as uint256;
}

/// An example contract is necessary for testing and compiling the MerkleMultiProof library.
contract MerkleMultiProofCalculatorDict {
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
