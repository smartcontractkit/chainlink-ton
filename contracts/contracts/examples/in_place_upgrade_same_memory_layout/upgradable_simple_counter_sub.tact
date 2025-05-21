import "./upgradable_simple_counter.tact";

/// This is version 2.0.0 of the UpgradableSimpleCounter contract, which subtracts 1 from the counter on each step instead of adding 1.
contract UpgradableSimpleCounterSub with UpgradableSimpleCounter {
    /// --- UpgradableSimpleCounter Attributes ---
    /// Contract owner
    owner: Address;
    /// Counter id
    id: Int as uint32;
    /// Counter value
    value: Int as uint32;

    init(
        id: Int,
        owner: Address,
        value: Int,
    ) {
        self.id = id;
        self.owner = owner;
        self.value = value;
    }

    /// --- UpgradableSimpleCounter Functions ---

    /// Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    override fun upgradableSimpleCounterVersion(): String {
        return "2.0.0";
    }

    /// Update counter
    override fun step() {
        self.value -= 1;
    }
}
