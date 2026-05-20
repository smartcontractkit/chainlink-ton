// SPDX-License-Identifier: MIT
// Imported from https://github.com/ton-blockchain/tolk-bench/blob/0f416ca611fbfa25e736973d01e5fb70af485468/contracts_Tolk/03_notcoin/storage.tolk
struct WalletStorage {
    status: uint4
    jettonBalance: coins
    ownerAddress: address
    minterAddress: address
}

struct MinterStorage {
    totalSupply: coins
    adminAddress: address?
    nextAdminAddress: address?
    jettonWalletCode: cell
    metadataUri: string
}



fun MinterStorage.load() {
    return MinterStorage.fromCell(contract.getData())
}

fun MinterStorage.save(self) {
    contract.setData(self.toCell())
}


fun WalletStorage.load() {
    return WalletStorage.fromCell(contract.getData())
}

fun WalletStorage.save(self) {
    contract.setData(self.toCell())
}
