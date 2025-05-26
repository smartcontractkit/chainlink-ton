const LEAF_DOMAIN_SEPARATOR: Int = 0x0000000000000000000000000000000000000000000000000000000000000000;
const INTERNAL_DOMAIN_SEPARATOR: Int = 0x0000000000000000000000000000000000000000000000000000000000000001;

const MAX_NUM_HASHES: Int = 256;

// Specific Error Codes
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


struct ListOfHashes {
    // If it is null then we are done iterating
    currentNode: Slice;

    // could be 1, 2 or 3
    currentHash: Int as uint8; 

    stop: Bool;
}

extends mutates fun nextHash(self: ListOfHashes): Int? {
    if self.stop {
        return null;
    }
    if (self.currentHash == 0) {
        let hash: Int = self.currentNode.loadUint(256);
        if hash == 0 {
            self.stop = true;
            return null;
        }
        self.currentHash = 1;
        return hash;
    }
    if (self.currentHash == 1) {
        let hash: Int = self.currentNode.loadUint(256);
        if hash == 0 {
            self.stop = true;
            return null;
        }
        self.currentHash = 2;
        return hash;
    }
    if (self.currentHash == 2) {
        let hash: Int = self.currentNode.loadUint(256);
        if hash == 0 {
            self.stop = true;
            return null;
        }
        self.currentHash = 0;
        if self.currentNode.refsEmpty() {
            self.stop = true;
            return hash;
        }
        self.currentNode = self.currentNode.loadRef().asSlice();
        return hash;
    }
    return null;
}

fun listOfHashes(list: Slice): ListOfHashes {
    if list.empty() {
        return ListOfHashes{currentNode: list, currentHash: 0, stop: true};
    }
    return ListOfHashes{currentNode: list, currentHash: 0, stop: false}
}

fun merkleRoot(
    leaves: Slice,
    leavesLen: Int,
    proofs: Slice,
    proofsLen: Int,
    proofFlagBits: Int,
): Int {
    throwUnless(ERROR_LEAVES_CANNOT_BE_EMPTY, leavesLen != 0);
    throwUnless(ERROR_LEAVES_TOO_LARGE, leavesLen <= MAX_NUM_HASHES + 1);
    throwUnless(ERROR_PROOFS_TOO_LARGE, proofsLen <= MAX_NUM_HASHES + 1);
    let totalHashes: Int = leavesLen + proofsLen - 1;
    throwUnless(ERROR_TOTAL_HASHES_EXCEEDED_MAX, totalHashes <= MAX_NUM_HASHES);

    let leavesIt = listOfHashes(leaves);
    let proofsIt = listOfHashes(proofs);

    if (totalHashes == 0) {
        return leavesIt.nextHash()!!;
    }

    let hashes: map<Int as uint16, Int as uint256> = emptyMap();
    let hashPos: Int = 0;
    let i: Int = 0;

    let proofsCounter: Int = 0;
    let leavesCounter: Int = 0;

    while (i < totalHashes) {
        let a: Int = 0;
        if ((proofFlagBits & (1 << i)) == (1 << i)) {
            // Use a leaf or a previously computed hash.
            let leaf: Int? = leavesIt.nextHash();
            if (leaf != null) {
                a = leaf!!;
                leavesCounter += 1;
            } else {
                let hash: Int? = hashes.get(hashPos);
                throwUnless(ERROR_HASH_NOT_FOUND, hash != null);
                a = hash!!;
                hashPos += 1;
            }
        } else {
            let proof: Int? = proofsIt.nextHash();
            throwUnless(ERROR_PROOF_NOT_FOUND, proof != null);
            a = proof!!;
            proofsCounter+= 1;
        }
        let b: Int = 0;
        let leaf: Int? = leavesIt.nextHash();
        if (leaf != null) {
            b = leaf!!;
            leavesCounter += 1;
        } else {
            let hash: Int? = hashes.get(hashPos);
            throwUnless(ERROR_HASH_NOT_FOUND, hash != null);
            b = hash!!;
            hashPos += 1;
        }
        throwUnless(ERROR_INVALID_HASH_POSITION, hashPos <= i);
        hashes.set(i, hashPair(a, b));
        i += 1;
    }

    throwUnless(ERROR_INCOMPLETE_HASH_CALCULATION, hashPos == totalHashes - 1);
    throwUnless(ERROR_MISMATCHED_LEAF_COUNT, leavesIt.nextHash() == null);
    throwUnless(ERROR_MISMATCHED_PROOF_COUNT, proofsIt.nextHash() == null);

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

