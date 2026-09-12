// SPDX-License-Identifier: MIT
import "types"

// Owner-only: register a new config for a configDigest.
// `signers` is a snake-encoded cell chain of packed 160-bit EVM addresses.
struct (0x1c46b5bf) Verifier_SetConfig {
    configDigest: uint256;
    f:            uint8;
    signers:      cell;
    signerCount:  uint8;
}

// Owner-only: replace the signer set for an existing configDigest.
// Caller must supply the current signers (prevSigners/prevSignerCount) for validation,
// and the replacement set (newSigners/newSignerCount).
struct (0x2137fc70) Verifier_UpdateConfig {
    configDigest:    uint256;
    f:               uint8;
    prevSigners:     cell;
    prevSignerCount: uint8;
    newSigners:      cell;
    newSignerCount:  uint8;
}

// Owner-only: mark an existing config as active.
struct (0x255a07ca) Verifier_ActivateConfig {
    configDigest: uint256;
}

// Owner-only: mark an existing config as inactive.
struct (0x070259c2) Verifier_DeactivateConfig {
    configDigest: uint256;
}

// Permissionless: verify a signed EVM ABI-encoded report.
// `data` is the full ABI-encoded payload (reportContext + reportData + signatures).
struct (0xb3597b7a) Verifier_Verify {
    data: cell;
}

type Verifier_InMessage =
    | Verifier_SetConfig
    | Verifier_UpdateConfig
    | Verifier_ActivateConfig
    | Verifier_DeactivateConfig
    | Verifier_Verify;
