// SPDX-License-Identifier: BUSL-1.1

const USD_PER_TOKEN_UPDATED_TOPIC: int = "UsdPerTokenUpdated".crc32();
struct UsdPerTokenUpdated {
    sourceToken: address
    usdPerToken: uint224
    timestamp: uint64
}

const USD_PER_UNIT_GAS_UPDATED: int = "UsdPerUnitGasUpdated".crc32();
struct UsdPerUnitGasUpdated {
    destChainSelector: uint64
    executionGasPrice: uint112
    dataAvailabilityGasPrice: uint112
    timestamp: uint64
}
