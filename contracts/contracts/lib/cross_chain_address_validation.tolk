import "../ccip/types"

tolk 1.1

const EVM_PRECOMPILE_SPACE = 1024;
const APTOS_PRECOMPILE_SPACE = 0x0b;

const ERROR_INVALID_EVM_ADDRESS = 5001;

struct EVMAddress {
    value: uint256;
}

const TYPE_UINT160_MAX = (1 << 160) - 1 /* type(uint160).max */

fun validateEVMAddress(receiver: CrossChainAddress) {
    val evmAddr = EVMAddress.fromSlice(receiver, {
        throwIfOpcodeDoesNotMatch: ERROR_INVALID_EVM_ADDRESS,
    });
    assert (evmAddr.value <= TYPE_UINT160_MAX) throw ERROR_INVALID_EVM_ADDRESS;
    assert (evmAddr.value >= EVM_PRECOMPILE_SPACE) throw ERROR_INVALID_EVM_ADDRESS;
}

struct a32ByteAddress {
    value: uint256;
}

fun validate32ByteAddress(receiver: CrossChainAddress, minValue: uint256) {
    val addr = a32ByteAddress.fromSlice(receiver, {
        throwIfOpcodeDoesNotMatch: ERROR_INVALID_EVM_ADDRESS,
    });
    if (minValue > 0) {
        assert (addr.value >= minValue) throw ERROR_INVALID_EVM_ADDRESS;
    }
}