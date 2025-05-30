import "../../lib/upgrades/upgradeable";
import "./upgradeable_counter";
import "./upgradeable_counter_v1";

struct UpgradeableCounterV2Layout {
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
}

/// This is version 2.0.0 of the UpgradeableCounter contract, which subtracts 1 to the counter on each step, instead of adding 1.
contract UpgradeableCounterV2(
    /// --- UpgradeableCounter Attributes ---
    /// Contract owner
    owner: Address,
    pendingOwner: Address?,

    /// --- UpgradeableCounter Attributes ---
    /// Counter value
    value: Int as uint64,
    /// Counter id
    id: Int as uint32,
    /// Note that these two attributes are switched compared to the V1 contract, and that the value is now a 64-bit integer.
) with UpgradeableCounter {
    override fun migrate(stateToBeMigrated: Cell): Cell {
        dump("Migrating state from UpgradeableCounterV1 to UpgradeableCounterV2...");
        let stateV1 = UpgradeableCounterV1.fromCell(stateToBeMigrated);
        return UpgradeableCounterV2Layout {
            owner: stateV1.owner,
            pendingOwner: stateV1.pendingOwner,
            id: stateV1.id,
            value: stateV1.value,
        }.toCell();
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
