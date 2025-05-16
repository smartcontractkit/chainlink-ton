/// Implements a basic upgrade mechanism with owner validation.
trait TypeAndVersion {
    /// A getter returning the current version of the contract.
    get fun type_and_version(): String {
        return beginString().concat(self.type()).concat(" v").concat(self.version()).toString();
    }

    // Type must be a TitleCase string that is uinique to the contract and should not change betwen versions.
    abstract fun type(): String;

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    abstract fun version(): String;
}
