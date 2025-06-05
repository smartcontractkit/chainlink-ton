struct ArrayUint256 {
	array: map<Int as uint16, Int as uint256>;
	length: Int as uint16;
}

struct ArrayAddress {
	array: map<Int as uint16, Address>;
	length: Int as uint16;
}

struct ArrayCells {
	array: map<Int as uint16, Cell>;
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

fun newArraySlices(): ArrayCells {
	return ArrayCells {
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

extends fun get(self: ArrayCells, index: Int): Cell {
	throwUnless(15000, index < self.length);
	let value = self.array.get(index);
	throwUnless(15001, value != null);
	return value!!;
}

extends fun has(self: ArrayUint256, value: Int): Bool {
	foreach (key, item in self.array) {
		if (item == value) {
			return true; // Value found
		}
	}
	return false; // Value not found
}

extends fun has(self: ArrayAddress, value: Address): Bool {
	foreach (key, item in self.array) {
		if (item == value) {
			return true; // Value found
		}
	}
	return false; // Value not found
}

extends mutates fun add(self: ArrayUint256, value: Int) {
	self.array.set(self.length, value);
	self.length += 1;
}

extends mutates fun add(self: ArrayAddress, value: Address) {
	self.array.set(self.length, value);
	self.length += 1;
}

extends mutates fun add(self: ArrayCells, value: Cell){
	self.array.set(self.length, value);
	self.length += 1;
}

extends fun hasDuplicates(self: ArrayUint256): Bool {
	let seen: map<Int as uint256, Bool> = emptyMap();
	foreach (key, value in self.array){
		if (seen.get(value) != null) {
			return true; // Duplicate found
		}
		seen.set(value, true);
	}
	return false; // No duplicates found
}

extends fun hasDuplicates(self: ArrayAddress): Bool {
	let seen: map<Address, Bool> = emptyMap();
	foreach (key, value in self.array){
		if (seen.get(value) != null) {
			return true; // Duplicate found
		}
		seen.set(value, true);
	}
	return false; // No duplicates found
}
