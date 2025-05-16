import "./proxy_counter";

/// UpgradableProxyChild is a trait that defines the interface for a child
/// of a upgradable proxy contract. It is able to tranfer its state so it can
/// be migrated to the new version of the contract.
trait UpgradableProxyChild with Ownable {
    /// --- Ownable Attributes ---
    /// Contract owner address that can perform upgrades.
    owner: Address;

    /// --- UpgradableProxyChild Functions ---

    /// Returns the current state of the contract to be used for migration.
    receive(msg: GetState) {
        message(MessageParameters {
            mode: SendRemainingValue,
            body: RequestedState {
                stateToBeMigrated: self.getState(),
            }.toCell(),
            value: 0,
            to: sender(),
            bounce: true,
        });
    }

    /// Returns the current state of the contract.
    abstract fun getState(): Cell;
}
