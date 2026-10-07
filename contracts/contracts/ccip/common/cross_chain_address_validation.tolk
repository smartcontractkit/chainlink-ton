// SPDX-License-Identifier: BUSL-1.1
// From https://github.com/smartcontractkit/chainlink-ccip/blob/2c65147d933b7c8e7495dc3d96a460c4c9006fbb/chains/evm/contracts/libraries/Internal.sol

import "types"

tolk 1.4.2

const EVM_PRECOMPILE_SPACE = 1024;
const APTOS_PRECOMPILE_SPACE = 0x0b;
const SUI_PRECOMPILE_SPACE = 0xdee9;

const CHAIN_FAMILY_SELECTOR_EVM:   uint32 = 0x2812d52c;
const CHAIN_FAMILY_SELECTOR_SVM:   uint32 = 0x1e10bdc4;
const CHAIN_FAMILY_SELECTOR_TVM:   uint32 = 0x647e2ba9;
const CHAIN_FAMILY_SELECTOR_APTOS: uint32 = 0xac77ffec;
const CHAIN_FAMILY_SELECTOR_SUI:   uint32 = 0xc4e05953;


const DestFamilyAddressValidation_FACILITY_NAME = "link.chain.ton.ccip.common.DestFamilyAddressValidation";
const DestFamilyAddressValidation_FACILITY_ID = DestFamilyAddressValidation_FACILITY_NAME.crc32() % 640 + 10; // 140
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

enum DestFamilyAddressValidation_Error {
    InvalidEVMAddress = DestFamilyAddressValidation_FACILITY_ID * 100
    Invalid32ByteAddress
    UnsupportedChainFamilySelector
}

struct EVMAddress {
    value: uint256;
}

const TYPE_UINT160_MAX = (1 << 160) - 1; /* type(uint160).max */

fun CrossChainAddress.validateEVMAddress(self) {
    var evmAddr: EVMAddress;
    try {
        evmAddr = EVMAddress.fromSlice(self);
    } catch {
        throw DestFamilyAddressValidation_Error.InvalidEVMAddress;
    }
    assert (evmAddr.value <= TYPE_UINT160_MAX) throw DestFamilyAddressValidation_Error.InvalidEVMAddress;
    assert (evmAddr.value >= EVM_PRECOMPILE_SPACE) throw DestFamilyAddressValidation_Error.InvalidEVMAddress;
}

struct a32ByteAddress {
    value: uint256;
}

fun CrossChainAddress.validate32ByteAddress(self, minValue: uint256) {
    val addr = a32ByteAddress.fromSlice(self, {
        throwIfOpcodeDoesNotMatch: DestFamilyAddressValidation_Error.Invalid32ByteAddress as int,
    });
    if (minValue > 0) {
        assert (addr.value >= minValue) throw DestFamilyAddressValidation_Error.Invalid32ByteAddress;
    }
}

/// Validates that destAddress matches the expected format of the destination chain family.
/// Shared by the FeeQuoter (message receivers) and the OnRamp (pool-supplied remote token
/// addresses); mirrors EVM `FeeQuoter._validateDestFamilyAddress` (Internal.sol):
/// - EVM:   32-byte abi-encoded address, <= uint160, >= precompile space.
/// - SVM:   32-byte address; must be non-zero when `requireNonZero` is set.
/// - APTOS: 32-byte address >= APTOS_PRECOMPILE_SPACE.
/// - SUI:   32-byte address >= SUI_PRECOMPILE_SPACE when `requireNonZero` is set.
///
/// Throws `Common_Error` codes; wrap in try/catch to map them to contract-specific errors.
///
/// @dev precondition - assumes the family tag is correct and validated.
fun validateDestFamilyAddress(chainFamilySelector: uint32, destAddress: CrossChainAddress, gasLimitIsZero: bool) {
    if (chainFamilySelector == CHAIN_FAMILY_SELECTOR_EVM) {
        return destAddress.validateEVMAddress();
    } else if (chainFamilySelector == CHAIN_FAMILY_SELECTOR_SVM) {
        // SVM addresses don't have a precompile space at the first X addresses,
        // instead we validate that if the gasLimit is non-zero, the address must
        // not be 0x0.
        return destAddress.validate32ByteAddress(gasLimitIsZero ? 0 : 1);
    } else if (chainFamilySelector == CHAIN_FAMILY_SELECTOR_APTOS) {
        return destAddress.validate32ByteAddress(APTOS_PRECOMPILE_SPACE);
    } else if (chainFamilySelector == CHAIN_FAMILY_SELECTOR_SUI) {
        return destAddress.validate32ByteAddress(gasLimitIsZero ? 0 : SUI_PRECOMPILE_SPACE);
    } else {
        throw DestFamilyAddressValidation_Error.UnsupportedChainFamilySelector;
    }
}
