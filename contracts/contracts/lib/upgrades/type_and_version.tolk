/// Implements getters for contract type and version, current code and code hash.

/// The implementor is expected to implement a `type_and_version(): cell` getter, wrapping a call to `typeAndVersio$handle_type_and_version(contract_type, version);`
/// Example:
/// ```tolk
/// const contract_type= "com.chainlink.ton.examples.Counter";
/// const version= "1.0.0";
/// get type_and_version(): cell {
///     return typeAndVersio$handle_type_and_version(contract_type, version);
/// }
/// ```

/// A getter returning the current type and version of the contract.
///
/// `typeStr` must be a Reverse Domain Name Notation string that is unique to the contract and should not change between versions.
/// Example: "com.chainlink.project.package.ContractName"
/// Read more about Reverse DNS Notation at https://en.wikipedia.org/wiki/Reverse_domain_name_notation
///
/// `versionStr` must be a semantic version string (e.g. "1.0.0").
fun typeAndVersio$handle_type_and_version(typeStr: slice, versionStr: slice): cell {
    return beginCell().storeSlice(typeStr).storeSlice(" v").storeSlice(versionStr).endCell();
}

// Returns the current code of the contract.
get fun code(): cell {
    return contract.getCode();
}

// Returns the sha256 hash of the current code of the contract.
get fun code_hash(): int {
    return contract.getCode().hash();
}


