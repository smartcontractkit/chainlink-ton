import "../libraries/merkle_multi_proof_v2.tact";

message MerkleMultiProof {
    leaves: Slice;
    leavesLen: Int as uint16;
    proofs: Slice;
    proofsLen: Int as uint16;
    proofFlagBits: Int as uint256;
}

/// An example contract is necessary for testing and compiling the MerkleMultiProof library.
contract MerkleMultiProofCalculator {
    root: Int as uint256 = 0;

    receive(proof: MerkleMultiProof) {
        let hash: Int = sha256(beginCell().storeUint(32, 256).asSlice());
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
