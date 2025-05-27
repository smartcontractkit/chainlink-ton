/**
 * @title Chainlink - Libraries - MerkleMultiProof
 */

const LEAF_DOMAIN_SEPARATOR: Int = 0x0000000000000000000000000000000000000000000000000000000000000000;
const INTERNAL_DOMAIN_SEPARATOR: Int = 0x0000000000000000000000000000000000000000000000000000000000000001;

const MAX_NUM_HASHES: Int = 128;

// --- Errror Codes ---

const ERROR_INVALID_PROOF: Int = 1000; // General invalid proof error (fallback)
const ERROR_LEAVES_CANNOT_BE_EMPTY: Int = 1001;
const ERROR_LEAVES_TOO_LARGE: Int = 1002;
const ERROR_PROOFS_TOO_LARGE: Int = 1003;
const ERROR_TOTAL_HASHES_EXCEEDED_MAX: Int = 1004;
const ERROR_LEAF_NOT_FOUND: Int = 1005;
const ERROR_HASH_NOT_FOUND: Int = 1006;
const ERROR_PROOF_NOT_FOUND: Int = 1007;
const ERROR_INVALID_HASH_POSITION: Int = 1008;
const ERROR_INCOMPLETE_HASH_CALCULATION: Int = 1009;
const ERROR_MISMATCHED_LEAF_COUNT: Int = 1010;
const ERROR_MISMATCHED_PROOF_COUNT: Int = 1011;
const ERROR_FINAL_HASH_NOT_FOUND: Int = 1012;

/// @notice Computes the Merkle root based on provided pre-hashed leaf nodes in `leaves`, internal nodes in `proofs`,
/// and using `proofFlagBits` to determine whether to use a proof element or a previously computed node during each step.
/// @param leaves A map containing pre-hashed leaves. The first 32 bytes of each preimage should match LEAF_DOMAIN_SEPARATOR.
/// @param leavesLen The number of elements in `leaves`.
/// @param proofs A map containing internal node hashes to be used when `proofFlagBits` indicates.
/// @param proofsLen The number of elements in `proofs`.
/// @param proofFlagBits A bitfield (single integer) where the i-th bit indicates if the i-th hash step uses a leaf/hash
/// (bit = 1) or a proof (bit = 0).
/// @return The final Merkle root as an Int (256-bit hash).
/// @dev The maximum number of hash operations is limited to 128. Exceeding this will trigger an error.
/// @dev If totalHashes = leavesLen + proofsLen - 1 == 0, then the single leaf at index 0 is returned as the root.
/// @dev Example (leaves = [a, b, c], proofs = [D], proofFlagBits = 5):
///     totalHashes = 3 + 1 - 1 = 3
///     ** round 0 **
///       proofFlagBits = (5 >> 0) & 1 = true
///       a = leaves[0], b = leaves[1]
///       hashes[0] = hashPair(a, b)
///       (leafPos, hashPos, proofPos) = (2, 0, 0)
///
///     ** round 1 **
///       proofFlagBits = (5 >> 1) & 1 = false
///       a = proofs[0], b = leaves[2]
///       hashes[1] = hashPair(D, c)
///       (leafPos, hashPos, proofPos) = (3, 0, 1)
///
///     ** round 2 **
///       proofFlagBits = (5 >> 2) & 1 = true
///       a = hashes[0], b = hashes[1]
///       hashes[2] = hashPair(hashes[0], hashes[1])
///       (leafPos, hashPos, proofPos) = (3, 2, 1)
///
///     i = 3 and no longer < totalHashes. The algorithm is done.
///     return hashes[2] (last computed hash).
///
/// @throws ERROR_LEAVES_CANNOT_BE_EMPTY if leavesLen == 0
/// @throws ERROR_LEAVES_TOO_LARGE if leavesLen > MAX_NUM_HASHES + 1
/// @throws ERROR_PROOFS_TOO_LARGE if proofsLen > MAX_NUM_HASHES + 1
/// @throws ERROR_TOTAL_HASHES_EXCEEDED_MAX if totalHashes > MAX_NUM_HASHES
/// @throws ERROR_LEAF_NOT_FOUND, ERROR_HASH_NOT_FOUND, ERROR_PROOF_NOT_FOUND on missing map elements
/// @throws ERROR_INVALID_HASH_POSITION if internal state is inconsistent
/// @throws ERROR_INCOMPLETE_HASH_CALCULATION if fewer than totalHashes - 1 hashes were generated
/// @throws ERROR_MISMATCHED_LEAF_COUNT, ERROR_MISMATCHED_PROOF_COUNT if not all inputs were consumed
/// @throws ERROR_FINAL_HASH_NOT_FOUND if final hash is missing from the result map
fun merkleRoot(
    leaves: map<Int as uint16, Int as uint256>,
    leavesLen: Int,
    proofs: map<Int as uint16, Int as uint256>,
    proofsLen: Int,
    proofFlagBits: Int,
): Int {
    throwUnless(ERROR_LEAVES_CANNOT_BE_EMPTY, leavesLen != 0);
    throwUnless(ERROR_LEAVES_TOO_LARGE, leavesLen <= MAX_NUM_HASHES + 1);
    throwUnless(ERROR_PROOFS_TOO_LARGE, proofsLen <= MAX_NUM_HASHES + 1);
    let totalHashes: Int = leavesLen + proofsLen - 1;
    throwUnless(ERROR_TOTAL_HASHES_EXCEEDED_MAX, totalHashes <= MAX_NUM_HASHES);
    if (totalHashes == 0) {
        return leaves.get(0)!!;
    }
    let hashes: map<Int as uint16, Int as uint256> = emptyMap();

    // indexes over the leaves, proofs, and hashes
    let leafPos: Int = 0;
    let hashPos: Int = 0;
    let proofPos: Int = 0;

    // total loop index
    let i: Int = 0;
    repeat (totalHashes) {
        // Checks if the bit flag signals the use of a supplied proof or a leaf/previous hash.
        let a: Int = 0;
        if ((proofFlagBits & (1 << i)) == (1 << i)) {
            // Use a leaf or a previously computed hash.
            if (leafPos < leavesLen) {
                let optionLeave: Int? = leaves.get(leafPos);
                throwUnless(ERROR_LEAF_NOT_FOUND, optionLeave != null);
                a = optionLeave!!;
                leafPos += 1;
            } else {
                let optionHash: Int? = hashes.get(hashPos);
                throwUnless(ERROR_HASH_NOT_FOUND, optionHash != null);
                a = optionHash!!;
                hashPos += 1;
            }
        } else {
            // Use a supplied proof.
            let optionProof: Int? = proofs.get(proofPos);
            throwUnless(ERROR_PROOF_NOT_FOUND, optionProof != null);
            a = optionProof!!;
            proofPos += 1;
        }
        // The second part of the hashed pair is never a proof as hashing two proofs would result in a
        // hash that can already be computed offchain.
        let b: Int = 0;
        if (leafPos < leavesLen) {
            let optionLeave: Int? = leaves.get(leafPos);
            throwUnless(ERROR_LEAF_NOT_FOUND, optionLeave != null); // Re-using for clarity, but could be a new code
            b = optionLeave!!;
            leafPos += 1;
        } else {
            let optionHash: Int? = hashes.get(hashPos);
            throwUnless(ERROR_HASH_NOT_FOUND, optionHash != null); // Re-using for clarity, but could be a new code
            b = optionHash!!;
            hashPos += 1;
        }
        throwUnless(ERROR_INVALID_HASH_POSITION, hashPos <= i);
        hashes.set(i, hashPair(a, b));
        i += 1;
    }
    // Sanity checks after the loop
    throwUnless(ERROR_INCOMPLETE_HASH_CALCULATION, hashPos == totalHashes - 1);
    throwUnless(ERROR_MISMATCHED_LEAF_COUNT, leafPos == leavesLen);
    throwUnless(ERROR_MISMATCHED_PROOF_COUNT, proofPos == proofsLen);

    let resOption: Int? = hashes.get(totalHashes - 1);
    throwUnless(ERROR_FINAL_HASH_NOT_FOUND, resOption != null);

    return resOption!!;
}

fun hashPair(a: Int, b: Int): Int {
    if a < b {
        return hashInternalNode(a, b);
    } else {
        return hashInternalNode(b, a);
    }
}

fun hashInternalNode(left: Int, right: Int): Int {
    let data: Cell = beginCell()
        .storeUint(INTERNAL_DOMAIN_SEPARATOR, 256)
        .storeUint(left, 256)
        .storeUint(right, 256)
        .endCell();
    let hashedNode: Int = sha256(data.asSlice());
    return hashedNode;
}
