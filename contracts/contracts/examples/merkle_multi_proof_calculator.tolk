import "./../lib/merkle_multi_proof/merkle_multi_proof.tolk"
import "./../lib/utils.tolk"

struct MerkleMultiProofCalculator {
    id: uint64,
    root: int256?
}

fun loadData(): MerkleMultiProofCalculator {
    return MerkleMultiProofCalculator.fromCell(contract.getData());
}
fun saveData(data: MerkleMultiProofCalculator) {
    contract.setData(data.toCell());
}


struct(0x00000001) CalculateRoot {
    queryId: uint64,
    leaves: cell,
    leavesLen: int16,
    proofs: cell,
    proofsLen: int16,
    proofFlagBits: uint256,
}

fun onInternalMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    if (msgBody.isEnd()) { // ignore all empty messages
        return;
    }

    var storage = loadData();

    val msg = CalculateRoot.fromSlice(msgBody);
    
    var leavesIterator = Iterator<uint256>.new(msg.leaves);
    var proofsIterator = Iterator<uint256>.new(msg.leaves);
    val root = merkleRoot(
        leavesIterator,
        msg.leavesLen,
        proofsIterator,
        msg.proofsLen,
        msg.proofFlagBits,
    );

    storage.root = root;
    saveData(storage);
}

get root(): int256 {
    var storage = loadData();
    if (storage.root == null) {
        return 0;
    }
    return storage.root!; // safe to unwrap since we initialized it above
}

