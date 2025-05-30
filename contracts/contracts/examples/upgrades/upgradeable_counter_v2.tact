import "../../lib/upgrades/upgradeable";
import "./upgradeable_counter";
import "./upgradeable_counter_v1";

/// This is version 2.0.0 of the UpgradeableCounter contract, which subtracts 1 to the counter on each step, instead of adding 1.
contract UpgradeableCounterV2 with UpgradeableCounter {
    /// --- UpgradeableCounter Attributes ---
    /// Contract owner
    owner: Address;
    pendingOwner: Address?;

    /// --- UpgradeableCounter Attributes ---

    /// Counter value
    value: Int as uint64;
    /// Counter id
    id: Int as uint32;
    /// Note that these two attributes are switched compared to the V1 contract, and that the value is now a 64-bit integer.

    // The second version must handle the state migration on initialization.
    // It uses the StateV1 struct to decode the state from the Cell.
    init(
        stateToBeMigrated: Cell,
    ) {
        let stateV1 = UpgradeableCounterV1.fromCell(stateToBeMigrated);
        self.owner = stateV1.owner;
        self.pendingOwner = stateV1.pendingOwner;
        self.id = stateV1.id;
        self.value = stateV1.value;
        self.emitUpgradeEvent();
    }

    /// --- UpgradeableCounter Functions ---

    /// Update counter
    override fun step() {
        self.value -= 1;
    }

    /// Gets the current counter value.
    get override fun value(): Int {
        return self.value;
    }

    /// --- TypeAndVersion Functions ---

    // Version must be a semantic version string (e.g. "1.0.0").
    override fun version(): String {
        return "2.0.0";
    }
}
