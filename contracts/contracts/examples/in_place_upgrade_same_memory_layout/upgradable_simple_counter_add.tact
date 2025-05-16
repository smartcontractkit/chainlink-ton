import "./upgradable_simple_counter.tact";

/// This is version 1.0.0 of the UpgradableSimpleCounter contract, which adds 1 to the counter on each step.
contract UpgradableSimpleCounterAdd with UpgradableSimpleCounter {
    /// --- UpgradableSimpleCounter Attributes ---
    /// Contract owner
    owner: Address;
    /// Counter id
    id: Int as uint32;
    /// Counter value
    counter: Int as uint32;

    init(
        id: Int,
        owner: Address,
        counter: Int,
    ) {
        self.id = id;
        self.owner = owner;
        self.counter = counter;
    }

    /// --- UpgradableSimpleCounter Functions ---

    /// Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    override fun upgradableSimpleCounterVersion(): String {
        return "1.0.0";
    }

    /// Update counter
    override fun step() {
        self.counter += 1;
    }
}
