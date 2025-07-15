import "@stdlib/common.tolk"

// Jetton message definitions in Tolk
// Common jetton opcodes (matching the FunC definitions)
const OP_TRANSFER = 0x0f8a7ea5
const OP_TRANSFER_NOTIFICATION = 0x7362d09c
const OP_INTERNAL_TRANSFER = 0x178d4519
const OP_EXCESSES = 0xd53276db
const OP_BURN = 0x595f07bc
const OP_BURN_NOTIFICATION = 0x7bdd97de

// Jetton Transfer message - sent to jetton wallet to initiate transfer
struct (0x0f8a7ea5) JettonTransfer {
    queryId: uint64
    amount: coins
    destination: address
    responseDestination: address
    customPayload: cell?
    forwardTonAmount: coins
    forwardPayload: cell? // Can be either inline slice or reference
}

// Jetton Transfer Notification - sent to destination address when receiving jettons
struct (0x7362d09c) JettonNotification {
    queryId: uint64
    amount: coins
    sender: address
    forwardPayload: cell?
}

// Internal Transfer - sent between jetton wallets
struct (0x178d4519) JettonTransferInternal {
    queryId: uint64
    amount: coins
    sender: address
    responseDestination: address
    forwardTonAmount: coins
    forwardPayload: slice
}

// Excesses message - returns excess TON to response destination
struct JettonExcesses {
    queryId: uint64
}

// Burn message - burn jettons
struct (0x595f07bc) JettonBurn {
    queryId: uint64
    amount: coins
    responseDestination: address
    customPayload: cell?
}

// Burn notification - notification to jetton master about burned tokens
struct (0x7bdd97de) JettonBurnNotification {
    queryId: uint64
    amount: coins
    sender: address
    responseDestination: address
}
