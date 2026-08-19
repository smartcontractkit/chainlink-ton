// SPDX-License-Identifier: MIT
import "../../lib/access/ownable_2step"
import "../../lib/secp256k1"
import "../../lib/utils"

import "errors"
import "types"
import "messages"
import "storage"
import "cell_reader"

tolk 1.4.1

contract Verifier {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.0.0"
    description: "link.chain.ton.data_streams.Verifier"

    storage: Storage
    incomingMessages: Verifier_InMessage | Ownable2Step_Messages
    thrownErrors: Verifier_Error | Ownable2Step_Error | Utils_Error
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy Verifier_InMessage.fromSlice(in.body);
    match (msg) {
        Verifier_SetConfig => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            _setConfig(mutate st, msg.configDigest, msg.f, msg.signers, msg.signerCount, true);
            st.store();
            _sendExcess(in.senderAddress);
        }
        Verifier_UpdateConfig => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            val entry = st.configs.get(msg.configDigest);
            assert(entry.isFound, Verifier_Error.ConfigDigestNotSet);
            val existing = entry.loadValue();
            assert(existing.oracleCount == msg.prevSignerCount, Verifier_Error.PrevSignerCountMismatch);
            _validatePrevSigners(existing, msg.prevSigners, msg.prevSignerCount);
            _setConfig(mutate st, msg.configDigest, msg.f, msg.newSigners, msg.newSignerCount, false);
            st.store();
            _sendExcess(in.senderAddress);
        }
        Verifier_ActivateConfig => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            val entry = st.configs.get(msg.configDigest);
            assert(entry.isFound, Verifier_Error.ConfigDigestNotSet);
            var config = entry.loadValue();
            config.isActive = true;
            st.configs.set(msg.configDigest, config);
            st.store();
            _sendExcess(in.senderAddress);
        }
        Verifier_DeactivateConfig => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            val entry = st.configs.get(msg.configDigest);
            assert(entry.isFound, Verifier_Error.ConfigDigestNotSet);
            var config = entry.loadValue();
            config.isActive = false;
            st.configs.set(msg.configDigest, config);
            st.store();
            _sendExcess(in.senderAddress);
        }
        Verifier_Verify => {
            val st = lazy Storage.load();
            _verify(st, msg.data);
            _sendExcess(in.senderAddress);
        }
        else => {
            var st = lazy Storage.load();
            val handled = st.ownable.onInternalMessage(in.senderAddress, in.body);
            if (handled) {
                st.store();
                return;
            }
            assert(in.body.isEmpty(), 0xFFFF);
        }
    }
}

// ─── Config management ────────────────────────────────────────────────────────

fun _setConfig(
    mutate st:    Storage,
    configDigest: uint256,
    f:            int,
    signersCell:  cell,
    signerCount:  int,
    checkNotExists: bool,
) {
    assert(f > 0, Verifier_Error.FaultToleranceMustBePositive);
    assert(signerCount <= MAX_NUM_ORACLES, Verifier_Error.ExcessSigners);
    assert(signerCount > 3 * f, Verifier_Error.InsufficientSigners);

    if (checkNotExists) {
        assert(!st.configs.get(configDigest).isFound, Verifier_Error.ConfigDigestAlreadySet);
    }

    var signers: map<uint160, uint8> = [];
    var s = signersCell.beginParse();
    var i = 0;
    while (i < signerCount) {
        if (s.remainingBitsCount() < 160 && s.remainingRefsCount() > 0) {
            s = s.loadRef().beginParse();
        }
        val addr = s.loadUint(160);
        assert(addr != 0, Verifier_Error.ZeroAddress);
        assert(!signers.get(addr).isFound, Verifier_Error.NonUniqueSigningKeys);
        signers.set(addr, i);
        i += 1;
    }

    st.configs.set(configDigest, VerifierConfig {
        f:           f,
        isActive:    true,
        oracleCount: signerCount,
        signers,
    });
}

fun _validatePrevSigners(existing: VerifierConfig, prevSignersCell: cell, prevSignerCount: int) {
    var seen: map<uint160, bool> = [];
    var s = prevSignersCell.beginParse();
    var i = 0;
    while (i < prevSignerCount) {
        if (s.remainingBitsCount() < 160 && s.remainingRefsCount() > 0) {
            s = s.loadRef().beginParse();
        }
        val addr = s.loadUint(160);
        assert(!seen.get(addr).isFound, Verifier_Error.NonUniqueSigningKeys);
        seen.set(addr, true);
        assert(existing.signers.get(addr).isFound, Verifier_Error.PrevSignerNotFound);
        i += 1;
    }
}

// ─── Report verification ──────────────────────────────────────────────────────
//
// EVM ABI static header (7 × 32 = 224 bytes):
//   [0]   reportContext[0] = configDigest
//   [32]  reportContext[1] = epoch/round
//   [64]  reportContext[2] = extra hash
//   [96]  offset to reportData
//   [128] offset to rs
//   [160] offset to ss
//   [192] rawVs (packed v bytes, one per signer, MSB-first)

fun _verify(st: Storage, data: cell) {
    val reportContext0  = readUint256At(data, 0);    // configDigest
    val reportContext1  = readUint256At(data, 32);   // epoch/round
    val reportContext2  = readUint256At(data, 64);   // extra hash
    val reportDataOffset = readUint256At(data, 96);
    val rsOffset        = readUint256At(data, 128);
    val ssOffset        = readUint256At(data, 160);
    val rawVs           = readUint256At(data, 192);

    assert(reportDataOffset >= 224, Verifier_Error.MalformedPayload);
    assert(rsOffset >= 224, Verifier_Error.MalformedPayload);
    assert(ssOffset >= 224, Verifier_Error.MalformedPayload);

    val reportDataLen  = readUint256At(data, reportDataOffset);
    val reportDataCell = readBytesAt(data, reportDataOffset + 32, reportDataLen);
    val rsCount        = readUint256At(data, rsOffset);
    val ssCount        = readUint256At(data, ssOffset);

    assert(rsCount == ssCount, Verifier_Error.MismatchedSignatures);
    assert(rsCount > 0 && rsCount <= MAX_NUM_ORACLES, Verifier_Error.IncorrectSignatureCount);

    val config = _loadActiveConfig(st, reportContext0, rsCount);
    val signingHash = _computeSigningHash(reportDataCell, reportContext0, reportContext1, reportContext2);
    val signedCount = _verifySignatures(data, rsOffset, ssOffset, rawVs, rsCount, signingHash, config);

    // Addition-based bitmap: any duplicate signer makes a byte > 0x01
    assert((signedCount & ORACLE_MASK) == signedCount, Verifier_Error.IncorrectSignatureCount);
}

fun _loadActiveConfig(st: Storage, configDigest: int, rsCount: int): VerifierConfig {
    val entry = st.configs.get(configDigest);
    assert(entry.isFound, Verifier_Error.ConfigDigestNotSet);
    val config = entry.loadValue();
    assert(config.isActive, Verifier_Error.DigestInactive);
    assert(rsCount == config.f + 1, Verifier_Error.IncorrectSignatureCount);
    return config;
}

// signingHash = keccak256( keccak256(reportData) || c0 || c1 || c2 )
// 4 × 256 = 1024 bits exceeds the 1023-bit cell limit, so c2 goes in a ref.
// keccak256x2 hashes across the two cells natively via HASHEXT_KECCAK256.
fun _computeSigningHash(reportData: cell, c0: int, c1: int, c2: int): int {
    val reportHash = keccak256SnakeCell(reportData);
    val s1 = beginCell()
        .storeUint(reportHash, 256)
        .storeUint(c0, 256)
        .storeUint(c1, 256)
        .endCell()
        .beginParse();
    val s2 = beginCell()
        .storeUint(c2, 256)
        .endCell()
        .beginParse();
    return keccak256x2(s1, s2);
}

fun _verifySignatures(
    data:        cell,
    rsOffset:    int,
    ssOffset:    int,
    rawVs:       int,
    rsCount:     int,
    signingHash: int,
    config:      VerifierConfig,
): int {
    var signedCount = 0;
    var sigIdx = 0;

    while (sigIdx < rsCount) {
        val r  = readUint256At(data, rsOffset + 32 + sigIdx * 32);
        val sv = readUint256At(data, ssOffset + 32 + sigIdx * 32);
        val v  = (rawVs >> (8 * (31 - sigIdx))) & 0xFF;

        // Build sig slice as v (uint8) || r (uint256) || s (uint256)
        val sigSlice = beginCell()
            .storeUint(v, 8)
            .storeUint(r, 256)
            .storeUint(sv, 256)
            .endCell()
            .beginParse();

        val ethAddr = evm_ecrecoverFrom(signingHash, sigSlice);
        assert(ethAddr != 0, Verifier_Error.InvalidSignature);

        val ordinalEntry = config.signers.get(ethAddr);
        assert(ordinalEntry.isFound, Verifier_Error.UnauthorizedSigner);
        val ordinal = ordinalEntry.loadValue();

        // Addition (not OR): duplicate signer makes byte > 0x01
        signedCount += (1 << (8 * ordinal));
        sigIdx += 1;
    }

    return signedCount;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fun _sendExcess(dest: address) {
    val msg = createMessage({
        bounce: false,
        value:  0,
        dest,
        body:   createEmptyCell(),
    });
    msg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

// ─── Getters ──────────────────────────────────────────────────────────────────

get fun owner(): address {
    val st = lazy Storage.load();
    return st.ownable.get_owner();
}

get fun pendingOwner(): address? {
    val st = lazy Storage.load();
    return st.ownable.get_pendingOwner();
}

get fun typeAndVersion(): (slice, slice) {
    return (Verifier_FACILITY_NAME.literalSlice(), "1.0.0".literalSlice());
}

get fun configIsSet(configDigest: uint256): bool {
    val st = lazy Storage.load();
    return st.configs.get(configDigest).isFound;
}

get fun facilityId(): uint16 {
    return Verifier_FACILITY_ID;
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(Verifier_FACILITY_NAME.crc32(), local);
}
