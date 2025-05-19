const LEAF_DOMAIN_SEPARATOR: Int = 0x0000000000000000000000000000000000000000000000000000000000000000;
const INTERNAL_DOMAIN_SEPARATOR: Int = 0x0000000000000000000000000000000000000000000000000000000000000001;

const MAX_NUM_HASHES: Int  = 256;

const ERROR_INVALID_PROOF: Int = 1000;
const ERROR_LEAVES_CANNOT_BE_EMPTY: Int = 1001;

fun merkleRoot(
	leaves: map<Int as uint16, Int as uint256>,
	leavesLen: Int,
	proofs: map<Int as uint16, Int as uint256>,
	proofsLen: Int,
	proofFlagBits: Int,
): Int {
	throwUnless(ERROR_LEAVES_CANNOT_BE_EMPTY, leavesLen != 0);
	throwUnless(ERROR_INVALID_PROOF, leavesLen <= MAX_NUM_HASHES + 1);
	throwUnless(ERROR_INVALID_PROOF, proofsLen <= MAX_NUM_HASHES + 1);
        let totalHashes: Int = leavesLen + proofsLen - 1;
	throwUnless(ERROR_INVALID_PROOF, totalHashes <= MAX_NUM_HASHES);
	if (totalHashes == 0) {
		return leaves.get(0)!!;
	}
	let hashes: map<Int as uint16, Int as uint256> = emptyMap();

	// indexes over the leaves proofs and hashes
	let leafPos: Int = 0 ;
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
			    if (optionLeave == null) {
				return ERROR_INVALID_PROOF;
			    }
			    a = optionLeave!!;
			    leafPos += 1;
			} else {
			    let optionHash: Int? = hashes.get(hashPos);
				if (optionHash == null) {
					return ERROR_INVALID_PROOF;
				}
				a = optionHash!!;
				hashPos += 1;
			}
		} else {
		// Use a supplied proof.
			let optionProof: Int? = proofs.get(proofPos);
			if (optionProof == null) {
				return ERROR_INVALID_PROOF;
			}
			a = optionProof!!;
			proofPos += 1;
		}
		// The second part of the hashed pair is never a proof as hashing two proofs would result in a
		// hash that can already be computed offchain.
		let b: Int = 0;
		if (leafPos < leavesLen) {
			let optionLeave: Int? = leaves.get(leafPos);
			if (optionLeave == null) {
			    return ERROR_INVALID_PROOF;
			}
			b = optionLeave!!;
			leafPos += 1;
		} else {
			let optionHash: Int? = hashes.get(hashPos);
			if (optionHash == null) {
			   return ERROR_INVALID_PROOF;
			}
			b = optionHash!!;
			hashPos += 1;

		}
		throwUnless(ERROR_INVALID_PROOF, hashPos <= i);
		//TODO: implement hashPair
		hashes.set(i, hashPair(a, b));
		i += 1;
	}
	throwUnless(ERROR_INVALID_PROOF, hashPos == totalHashes - 1);
	throwUnless(ERROR_INVALID_PROOF, leafPos == leavesLen);
	throwUnless(ERROR_INVALID_PROOF, proofPos == proofsLen);

	return hashes.get(totalHashes - 1)!!;
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
	let hashedNode: Int = keccak256(data.asSlice());
	return hashedNode;
}
