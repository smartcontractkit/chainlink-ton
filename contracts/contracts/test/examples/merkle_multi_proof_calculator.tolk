// SPDX-License-Identifier: MIT
import "../../lib/crypto/merkle_multi_proof.tolk"
import "../../lib/utils.tolk"

struct MerkleMultiProofCalculator {
    id: uint64,
    root: uint256
}

fun loadData(): MerkleMultiProofCalculator {
    return MerkleMultiProofCalculator.fromCell(contract.getData());
}
fun saveData(data: MerkleMultiProofCalculator) {
    contract.setData(data.toCell());
}


struct(0x00000001) CalculateRoot {
    queryId: uint64,
    leaves: SnakedCell<uint256>,
    proofs: SnakedCell<uint256>,
    proofFlagBits: uint256,
}

fun onInternalMessage(_myBalance: int, _msgValue: int, _msgFull: cell, msgBody: slice) {
    if (msgBody.isEmpty()) { // ignore all empty messages
        return;
    }

    var storage = loadData();
    val msg = CalculateRoot.fromSlice(msgBody);

    val leavesIterator = msg.leaves.iter();
    val proofsIterator = msg.proofs.iter();
    val root = merkleRoot(
        leavesIterator,
        proofsIterator,
        msg.proofFlagBits,
    );

    storage.root = root;
    saveData(storage);
}

get fun root(): uint256 {
    val storage = loadData();
    return storage.root;
}

