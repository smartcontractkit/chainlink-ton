import "./upgradable_counter";

/// UpgradableCounterV1 Layout
/// Must match the attributes of the UpgradableCounterV1 contract + the lazyDeploymentBit at the begining.
struct StateV1 {
    lazyDeploymentBit: Bool;
    /// Contract owner
    owner: Address;
    /// Counter id
    id: Int as uint32;
    /// Counter value
    value: Int as uint32;
}

/// This is version 2.0.0 of the UpgradableCounter contract, which subtracts 1 to the counter on each step, instead of adding 1.
contract UpgradableCounterV2 with UpgradableCounter {
    /// --- UpgradableCounter Attributes ---
    /// Contract owner
    owner: Address;

    /// --- UpgradableCounter Attributes ---

    /// Counter id
    value: Int as uint64;
    /// Counter value
    id: Int as uint32;

    // The second version must handle the state migration on initialization.
    // It uses the StateV1 struct to decode the state from the Cell.
    init(
        stateToBeMigrated: Cell,
    ) {
        let stateV1 = StateV1.fromCell(stateToBeMigrated);
        self.owner = stateV1.owner;
        self.id = stateV1.id;
        self.value = stateV1.value;
    }

    /// --- UpgradableCounter Functions ---

    /// Update counter
    override fun step() {
        self.value -= 1;
    }

    /// Gets the current counter value.
    get override fun value(): Int {
        return self.value;
    }

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    override fun upgradableCounterVersion(): String {
        return "2.0.0";
    }
}
