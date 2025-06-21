import "../utils.tolk"


// --- Errror Codes ---

const ERROR_INVALID_PROOF_LEAVES_CANNOT_BE_EMPTY: int = 1001;
const ERROR_INVALID_PROOF_LEAVES_TOO_LARGE: int = 1002;
const ERROR_INVALID_PROOF_PROOFS_TOO_LARGE: int = 1003;
const ERROR_INVALID_PROOF_TOTAL_HASHES_EXCEEDED_MAX: int = 1004;
const ERROR_INVALID_PROOF_LEAF_NOT_FOUND: int = 1005;
const ERROR_INVALID_PROOF_HASH_NOT_FOUND: int = 1006;
const ERROR_INVALID_PROOF_PROOF_NOT_FOUND: int = 1007;
const ERROR_INVALID_PROOF_INVALID_HASH_POSITION: int = 1008;
const ERROR_INVALID_PROOF_INCOMPLETE_HASH_CALCULATION: int = 1009;
const ERROR_INVALID_PROOF_MISMATCHED_LEAF_COUNT: int = 1010;
const ERROR_INVALID_PROOF_MISMATCHED_PROOF_COUNT: int = 1011;
const ERROR_INVALID_PROOF_FINAL_HASH_NOT_FOUND: int = 1012;

/// @notice internal domain separator, should be used as the first 32 bytes of an internal node's preimage.
const INTERNAL_DOMAIN_SEPARATOR: int = 0x0000000000000000000000000000000000000000000000000000000000000001;

/// @notice Maximum number of hashes that can be computed in a single Merkle root calculation.
const MAX_NUM_HASHES: int = 128;

/// @notice Computes the Merkle root based on provided pre-hashed leaf nodes in `leaves`, internal nodes in `proofs`,
/// and using `proofFlagBits` to determine whether to use a proof element or a previously computed node during each step.
fun merkleRoot(
    leaves: Iterator<uint256>,
    leavesLen: int16,
    proofs: Iterator<uint256>,
    proofsLen: int16,
    proofFlagBits: uint256,
): int {
    assert (leavesLen != 0, ERROR_INVALID_PROOF_LEAVES_CANNOT_BE_EMPTY);
    assert (leavesLen <= MAX_NUM_HASHES, ERROR_INVALID_PROOF_LEAVES_TOO_LARGE + 1);
    assert (proofsLen <= MAX_NUM_HASHES, ERROR_INVALID_PROOF_PROOFS_TOO_LARGE + 1);

    var totalHashes: int = leavesLen + proofsLen - 1;

    assert (totalHashes <= MAX_NUM_HASHES, ERROR_INVALID_PROOF_TOTAL_HASHES_EXCEEDED_MAX);

    if (totalHashes == 0) {
        return leaves.next();
    }

    var hashes = createEmptyTuple();

    // indexes over the leaves, proofs, and hashes
    var hashPos: int = 0;

    var i: int = 0;
    while (i < totalHashes) {
        // Find the first hash needed to compute the parent.
        // Check the ith value of the bitmap that signals wether to use an element from proofs or leaves.
        var a: int = 0;
        if ((proofFlagBits & (1 << i)) == (1 << i)) {
            // Use a leaf or a previously computed hash.
            if (! leaves.empty()) {
                a = leaves.next();
            } else {
                a = hashes.get(hashPos);
                hashPos += 1;
            }
        } else {
            // Use the next supplied proof.
            a = proofs.next();
        }

        // Find the second hash needed to compute the parent. It is never a proof.
        var b: int = 0;
        if (! leaves.empty()) {
            b = leaves.next();
        } else {
            b = hashes.get(hashPos);
        }
        
        // Hash the two children to get the parent
        hashes.push(hashPair(a, b));
        i += 1;
    }
    // The last hash is the root.
    return hashes.get(hashPos);
}

fun hashPair(a: int, b: int): int {
    if (a < b) {
        return hashInternalNode(a, b);
    } else {
        return hashInternalNode(b, a);
    }
}

fun hashInternalNode(a: int, b: int): int {
    var data = beginCell()
        .storeUint(INTERNAL_DOMAIN_SEPARATOR, 256)
        .storeUint(a, 256)
        .storeUint(b, 256)
        .endCell();
    return data.hash();
}
