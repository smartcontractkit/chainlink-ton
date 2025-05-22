import "./upgradable_counter";

/// This is version 1.0.0 of the UpgradableCounter contract, which adds 1 to the counter on each step.
contract UpgradableCounterV1 with UpgradableCounter {
    /// --- UpgradableCounter Attributes ---
    /// Contract owner
    owner: Address;

    /// --- UpgradableCounter Attributes ---

    /// Counter id
    id: Int as uint32;
    /// Counter value
    value: Int as uint32;

    init(
        id: Int,
        owner: Address,
        value: Int,
    ) {
        self.owner = owner;
        self.id = id;
        self.value = value;
    }

    /// --- UpgradableCounter Functions ---

    /// Update counter
    override fun step() {
        self.value += 1;
    }

    /// Gets the current counter value.
    get override fun value(): Int {
        return self.value;
    }

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    override fun upgradableCounterVersion(): String {
        return "1.0.0";
    }
}
