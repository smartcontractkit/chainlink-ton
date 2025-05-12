import "./upgradeable";

/// Implements a basic upgrade mechanism with owner validation.
trait TypeAndVersion with Upgradable {
    owner: Address;
    _version: Int as uint32;

    /// A getter returning the current version of the contract.
    get fun type_and_version(): String {
        return beginString().concat(self.type()).concat(" ").concat(self._version.toString()).toString();
    }

    abstract fun type(): String;
}
