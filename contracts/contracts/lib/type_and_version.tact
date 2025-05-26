/// Implements a basic upgrade mechanism with owner validation.
trait TypeAndVersion {
    /// A getter returning the current version of the contract.
    get fun type_and_version(): String {
        return beginString().concat(self.type()).concat(" v").concat(self.version()).toString();
    }

    // Type must be a Reverse Domain Name Notation string that is uinique to the contract and should not change betwen versions.
    // Example: "com.chainlink.project.package.ContractName"
    // Read more about Reverse DNS Notation at https://en.wikipedia.org/wiki/Reverse_domain_name_notation
    abstract fun type(): String;

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    abstract fun version(): String;

    // Returns the current code of the contract.
    get fun code(): Cell {
        return getCode();
    }

    // Returns the sha256 hash of the current code of the contract.
    get fun codeHash(): Int {
        return getCode().hash();
    }
}

// asm fun getCode(data: Cell) { c4 POP }
@name(my_code)
native getCode(): Cell;
