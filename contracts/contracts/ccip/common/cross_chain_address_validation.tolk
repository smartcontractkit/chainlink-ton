// SPDX-License-Identifier: BUSL-1.1
// From https://github.com/smartcontractkit/chainlink-ccip/blob/2c65147d933b7c8e7495dc3d96a460c4c9006fbb/chains/evm/contracts/libraries/Internal.sol

import "../lib/cross_chain_address/types"

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
const DestFamilyAddressValidation_FACILITY_ID = DestFamilyAddressValidation_FACILITY_NAME.crc32() % 640 + 10; // 351
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
    var addr: a32ByteAddress;
    try {
        addr = a32ByteAddress.fromSlice(self);
    } catch {
        throw DestFamilyAddressValidation_Error.Invalid32ByteAddress;
    }
    if (minValue > 0) {
        assert (addr.value >= minValue) throw DestFamilyAddressValidation_Error.Invalid32ByteAddress;
    }
}

/// Validates that destAddress matches the expected format of the destination chain family.
/// Shared by the FeeQuoter and the OnRamp; mirrors EVM `FeeQuoter._validateDestFamilyAddress`.
/// Throws `DestFamilyAddressValidation_Error` codes; wrap in try/catch to map them to
/// contract-specific errors. Assumes the family tag is already validated.
fun validateDestFamilyAddress(chainFamilySelector: uint32, destAddress: CrossChainAddress, gasLimitIsZero: bool) {
    if (chainFamilySelector == CHAIN_FAMILY_SELECTOR_EVM) {
        return destAddress.validateEVMAddress();
    } else if (chainFamilySelector == CHAIN_FAMILY_SELECTOR_SVM) {
        // SVM has no precompile space: a non-zero gasLimit requires a non-zero address.
        return destAddress.validate32ByteAddress(gasLimitIsZero ? 0 : 1);
    } else if (chainFamilySelector == CHAIN_FAMILY_SELECTOR_APTOS) {
        return destAddress.validate32ByteAddress(APTOS_PRECOMPILE_SPACE);
    } else if (chainFamilySelector == CHAIN_FAMILY_SELECTOR_SUI) {
        return destAddress.validate32ByteAddress(gasLimitIsZero ? 0 : SUI_PRECOMPILE_SPACE);
    } else {
        throw DestFamilyAddressValidation_Error.UnsupportedChainFamilySelector;
    }
}
