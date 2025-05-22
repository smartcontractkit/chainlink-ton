import "../../lib/upgradable";
import "./upgradable_counter_add";
import "./upgradable_counter";

/// Counter State version 1
struct StateV1 {
    lazy_deployment_bit: Bool;
    /// Contract owner
    owner: Address;
    /// Counter id
    id: Int as uint32;
    /// Counter value
    value: Int as uint32;
}

/// This is version 2.0.0 of the UpgradableCounter contract, which subtracts 1 to the counter on each step, instead of adding 1.
contract UpgradableCounterSub with UpgradableCounter {
    /// --- UpgradableCounter Attributes ---
    /// Contract owner
    owner: Address;

    /// --- UpgradableCounter Attributes ---

    /// Counter id
    value: Int as uint64;
    /// Counter value
    id: Int as uint32;

    /// Migrates the state from the old version to the new one.
    init(
        initParams: InitParams,
    ) {
        self.owner = initParams.header.owner;
        let stateV1 = StateV1.fromCell(initParams.stateToBeMigrated);
        self.id = stateV1.id;
        self.value = stateV1.value;
    }

    /// --- UpgradableCounter Functions ---

    /// Update counter
    override fun step() {
        self.state.value -= 1;
    }

    /// Gets the current counter value.
    override fun value(): Int {
        return self.state.value;
    }

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    override fun upgradableCounterVersion(): String {
        return "2.0.0";
    }
}
