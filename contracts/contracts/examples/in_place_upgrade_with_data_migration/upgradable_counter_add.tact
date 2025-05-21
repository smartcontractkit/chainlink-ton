import "./upgradable_counter";

/// Counter State version 1
struct StateV1 {
    /// Counter id
    id: Int as uint32;
    /// Counter value
    value: Int as uint32;
}

/// This is version 1.0.0 of the UpgradableCounter contract, which adds 1 to the counter on each step.
contract UpgradableCounterAdd with UpgradableCounter {
    /// --- UpgradableCounter Attributes ---
    /// Contract owner
    owner: Address;

    /// This is the code that will be used to upgrade the contract.
    upgradeToCommit: Upgrade?;

    /// --- UpgradableCounter Attributes ---

    /// Counter State
    state: StateV1;

    init(
        id: Int,
        owner: Address,
        value: Int,
    ) {
        self.owner = owner;
        self.state = StateV1 {
            id: id,
            value: value,
        };
        self.upgradeToCommit = null;
    }

    /// --- UpgradableCounter Functions ---

    /// Returns the current state of the contract.
    override fun getStateInternal(): Cell {
        return self.state.toCell();
    }

    /// Update counter
    override fun step() {
        self.state.value += 1;
    }

    /// Gets the current counter value.
    override fun value(): Int {
        return self.state.value;
    }

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    override fun upgradableCounterVersion(): String {
        return "1.0.0";
    }
}
