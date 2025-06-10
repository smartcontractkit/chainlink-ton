/// Implements a basic upgrade mechanism with owner validation.

/// A getter returning the current version of the contract.
fun typeAndVersio$handle_type_and_version(contractType: slice, version: slice): cell {
    return beginCell().storeSlice(contractType).storeSlice(" v").storeSlice(version).endCell();
}

// Returns the current code of the contract.
get fun code(): Cell {
    return contract.getCode();
}

// Returns the sha256 hash of the current code of the contract.
get fun codeHash(): Int {
    return contract.getCode().hash();
}

/// Type must be a Reverse Domain Name Notation string that is unique to the contract and should not change between versions.
/// Example: "com.chainlink.project.package.ContractName"
/// Read more about Reverse DNS Notation at https://en.wikipedia.org/wiki/Reverse_domain_name_notation
// abstract fun type(): String;

/// Version must be a semantic version string (e.g. "1.0.0").
// abstract fun version(): String;

