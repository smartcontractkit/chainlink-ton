import "@stdlib/common.tolk";

// Jetton wallet utilities for Tolk

const JETTON_TOPIC: int = 0x351; // for easier indexing

const STATUS_SIZE = 4;
const MY_WORKCHAIN = 0; // Basechain

// Jetton Wallet state structure  
struct JettonWalletData {
    status: uint4;
    balance: coins;
    ownerAddress: address;
    jettonMasterAddress: address;
}

// Pack jetton wallet data for storage
fun packJettonWalletData(status: int, balance: coins, ownerAddress: address, jettonMasterAddress: address): cell {
    return JettonWalletData{
        status: status,
        balance: balance,
        ownerAddress: ownerAddress,
        jettonMasterAddress: jettonMasterAddress
    }.toCell();
}

// Calculate jetton wallet state init
fun calculateJettonWalletStateInit(ownerAddress: address, jettonMasterAddress: address, jettonWalletCode: cell): cell {
    return StateInit {
        fixedPrefixLength: null,
        special: null,
        code: jettonWalletCode,
        data: packJettonWalletData(0, 0, ownerAddress, jettonMasterAddress),
        library: null
    }.toCell();
}


fun calculateJettonWalletAddress(stateInit: cell): address {
    var b = beginCell();
    b = b.storeUint(4, 3); // 0b100 = addr_std$10 tag; No anycast
    b = b.storeInt(MY_WORKCHAIN, 8);
    b = b.storeUint(stateInit.hash(), 256);
    return b.endCell().beginParse().loadAddress();
}

fun calculateUserJettonWalletAddress(ownerAddress: address, jettonMasterAddress: address, jettonWalletCode: cell): address {
    val stateInit = calculateJettonWalletStateInit(ownerAddress, jettonMasterAddress, jettonWalletCode);
    return calculateJettonWalletAddress(stateInit);
}