import "../libraries/merkle_multi_proof.tact";

message MerkleMultiProof {
    leaves: map<Int as uint16, Int as uint256>;
    leavesLen: Int as uint16;
    proofs: map<Int as uint16, Int as uint256>;
    proofsLen: Int as uint16;
    proofFlagBits: Int as uint256;
}

contract MerkleMultiProofCalculater {

    receive(proof: MerkleMultiProof) {
        let res = merkleRoot(
             proof.leaves,
             proof.leavesLen,
             proof.proofs,
             proof.proofsLen,
             proof.proofFlagBits
         ); 
    }

}
