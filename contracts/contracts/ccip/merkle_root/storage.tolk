// SPDX-License-Identifier: BUSL-1.1
import "../offramp/types";
import "./errors"

struct MerkleRoot_Storage {
    root: uint256;
    owner: address;
    timestamp: uint64;
    minMsgNr: uint64;
    maxMsgNr: uint64;
    messageStates: uint128; // seq_num offset -> state (2 bits)
    pendingExecutorDeploy: uint64 = 0; // seq_num offset -> 1 bit: the message's next execution attempt must deploy its ReceiveExecutor
    deliveredMessageCount: uint16 = 0;
}

fun MerkleRoot_Storage.load(): MerkleRoot_Storage {
    return MerkleRoot_Storage.fromCell(contract.getData());
}

fun MerkleRoot_Storage.store(self) {
    return contract.setData(self.toCell());
}

fun MerkleRoot_Storage.expectedMessages(self): int {
    return self.maxMsgNr - self.minMsgNr + 1
}

// Offset of `seqNum` in the per-message bitmaps (messageStates, pendingExecutorDeploy).
fun MerkleRoot_Storage.messageOffset(self, seqNum: uint64): int {
    assert (seqNum >= self.minMsgNr && seqNum <= self.maxMsgNr) throw (MerkleRoot_Error.SeqNumOutOfBounds);
    val i = seqNum - self.minMsgNr;
    assert (i < 64) throw (MerkleRoot_Error.SeqNumOutOfBounds);
    return i;
}

fun MerkleRoot_Storage.setMessageState(mutate self, seqNum: uint64, executionState: ExecutionState) {
    val i = self.messageOffset(seqNum);

    // Clear the 2 bits at position 'i'
    self.messageStates &= ~(0b11 << (i * 2));
    // Set the new value in the cleared bits
    self.messageStates |= (executionState as int as uint128) << (i * 2);
}

fun MerkleRoot_Storage.getMessageState(self, seqNum: uint64): ExecutionState {
    val i = self.messageOffset(seqNum);

    val mask = 0b11 << (i * 2);
    val state = (self.messageStates & mask) >> (i * 2);
    // SAFETY: The state is masked to be between 0 and 3, which are valid ExecutionState values
    return state as ExecutionState
}

fun MerkleRoot_Storage.isExecutorDeployPending(self, seqNum: uint64): bool {
    val i = self.messageOffset(seqNum);
    return ((self.pendingExecutorDeploy >> i) & 1) == 1;
}

fun MerkleRoot_Storage.setExecutorDeployPending(mutate self, seqNum: uint64, pending: bool) {
    val i = self.messageOffset(seqNum);
    if (pending) {
        self.pendingExecutorDeploy |= (1 << i);
    } else {
        self.pendingExecutorDeploy &= ~(1 << i);
    }
}
