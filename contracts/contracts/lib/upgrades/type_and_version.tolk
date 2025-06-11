/// Implements getters for contract type and version, current code and code hash.

/// The implementor is expected to implement a `type_and_version(): cell` getter, wrapping a call to `typeAndVersion$handle_type_and_version(contract_type, version);`
/// Example:
/// ```tolk
/// const contract_type= "com.chainlink.ton.examples.Counter";
/// const version= "1.0.0";
/// get type_and_version(): cell {
///     return typeAndVersion$handle_type_and_version(contract_type, version);
/// }
/// ```

/// A getter returning the current type and version of the contract.
///
/// `typeStr` must be a Reverse Domain Name Notation string that is unique to the contract and should not change between versions.
/// Example: "com.chainlink.project.package.ContractName"
/// Read more about Reverse DNS Notation at https://en.wikipedia.org/wiki/Reverse_domain_name_notation
///
/// `versionStr` must be a semantic version string (e.g. "1.0.0").
struct TypeAndVersion {
    typeStr: slice,
    versionStr: slice,
}

fun TypeAndVersion.typeAndVersion(self): cell {
    return beginCell().storeSlice(self.typeStr).storeSlice(" v").storeSlice(self.versionStr).endCell();
}

// Returns the current code of the contract.
get fun code(): cell {
    return contract.getCode();
}

// Returns the sha256 hash of the current code of the contract.
get fun codeHash(): int {
    return contract.getCode().hash();
}


