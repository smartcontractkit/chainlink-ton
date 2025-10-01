import "../lib/access/ownable_2step.tolk";

//TODO implement

const CONTRACT_VERSION = "0.0.1";

struct Storage {
    ownable: Ownable2Step;
}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}

fun onInternalMessage(msgCell: cell, msgBody: slice) {
}


get fun typeAndVersion(): (slice, slice) {
    return ("com.chainlink.ton.ccip.RMNRemote", CONTRACT_VERSION);
}

// Returns the current code of the contract.
get fun code(): cell {
    return contract.getCode();
}

// Returns the sha256 hash of the current code of the contract.
get fun codeHash(): int {
    return contract.getCode().hash();
}
