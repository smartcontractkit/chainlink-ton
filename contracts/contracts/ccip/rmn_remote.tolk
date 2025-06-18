
struct Storage {
    owner: address;
}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}

fun onInternalMessage(msgCell: cell, msgBody: slice) {
}


// TypeAndVersion

// override fun type(): String {
//     return "com.chainlink.ton.ccip.RMNRemote";
// }

// override fun version(): String {
//     return "1.0.0";
// }
