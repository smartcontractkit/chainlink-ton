import "./upgradeable_counter";

/// This is version 1.0.0 of the UpgradeableCounter contract, which adds 1 to the counter on each step.
contract UpgradeableCounterV1 with UpgradeableCounter {
    /// --- UpgradeableCounter Attributes ---
    owner: Address;
    pendingOwner: Address?;

    /// --- UpgradeableCounter Attributes ---

    /// Counter id
    id: Int as uint32;
    /// Counter value
    value: Int as uint32;

    // The first version does not require to handle the state migration.
    // This is how the state is deployed.
    init(
        id: Int,
        owner: Address,
        value: Int,
    ) {
        self.owner = owner;
        self.id = id;
        self.value = value;
    }

    /// --- UpgradeableCounter Functions ---

    /// Update counter
    override fun step() {
        self.value += 1;
    }

    /// Gets the current counter value.
    get override fun value(): Int {
        return self.value;
    }

    // Version must be a semantic version string (e.g. "1.0.0").
    override fun upgradeableCounterVersion(): String {
        return "1.0.0";
    }
}
