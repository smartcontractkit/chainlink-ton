// From https://github.com/smartcontractkit/chainlink-ccip/blob/2c65147d933b7c8e7495dc3d96a460c4c9006fbb/chains/evm/contracts/libraries/Internal.sol

import "types"

tolk 1.2

const EVM_PRECOMPILE_SPACE = 1024;
const APTOS_PRECOMPILE_SPACE = 0x0b;

const ERROR_INVALID_EVM_ADDRESS = 5001;

struct EVMAddress {
    value: uint256;
}

const TYPE_UINT160_MAX = (1 << 160) - 1; /* type(uint160).max */

fun CrossChainAddress.validateEVMAddress(self) {
    var evmAddr: EVMAddress;
    try {
        evmAddr = EVMAddress.fromSlice(self);
    } catch {
        throw ERROR_INVALID_EVM_ADDRESS;
    }
    assert (evmAddr.value <= TYPE_UINT160_MAX) throw ERROR_INVALID_EVM_ADDRESS;
    assert (evmAddr.value >= EVM_PRECOMPILE_SPACE) throw ERROR_INVALID_EVM_ADDRESS;
}

struct a32ByteAddress {
    value: uint256;
}

fun CrossChainAddress.validate32ByteAddress(self, minValue: uint256) {
    val addr = a32ByteAddress.fromSlice(self, {
        throwIfOpcodeDoesNotMatch: ERROR_INVALID_EVM_ADDRESS,
    });
    if (minValue > 0) {
        assert (addr.value >= minValue) throw ERROR_INVALID_EVM_ADDRESS;
    }
}
