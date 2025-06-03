struct ArrayUint256 {
	array: map<Int as uint16, Int as uint256>;
	length: Int as uint16;
}

struct ArrayAddress {
	array: map<Int as uint16, Address>;
	length: Int as uint16;
}

fun newArrayUint256(): ArrayUint256 {
	return ArrayUint256 {
		array: emptyMap(),
		length: 0
	};
}

fun newArrayAddress(): ArrayAddress {
	return ArrayAddress {
		array: emptyMap(),
		length: 0
	};
}

extends fun get(self: ArrayAddress, index: Int): Address {
	throwUnless(15000, index < self.length);
	let value = self.array.get(index);
	throwUnless(15001, value != null);
	return value!!;
}

extends fun get(self: ArrayUint256, index: Int): Int {
	throwUnless(15000, index < self.length);
	let value = self.array.get(index);
	throwUnless(15001, value != null);
	return value!!;
}

fun hasDuplicates(array: ArrayUint256) {
	let seen: map<Int as uint256, Bool> = emptyMap();
	foreach (key, value in array.array){
		if (seen.get(value) != null) {
			return true; // Duplicate found
		}
		seen.set(value, true);
	}
	return false; // No duplicates found
}

fun hasDuplicates(array: ArrayAddress) {
	let seen: map<Address, Bool> = emptyMap();
	foreach (key, value in array.array){
		if (seen.get(value) != null) {
			return true; // Duplicate found
		}
		seen.set(value, true);
	}
	return false; // No duplicates found
}
