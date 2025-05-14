import "./upgradeablebg_counter";

struct StateV1 {
    id: Int as uint32;
    counter: Int as uint32;
}

contract UpgradeableGBCounterAdd with UpgradeableGBCounter {
    /// Ownable
    owner: Address;

    /// UpgradableBG

    /// New version
    _version: Int as uint32;
    upgradeToCommit: Upgrade?;
    state_tb_migrated: Cell?;

    // Counter
    state: StateV1;

    init(
        id: Int,
        owner: Address,
        counter: Int,
    ) {
        self.owner = owner;
        self.state = StateV1 {
            id: id,
            counter: counter,
        };
        self._version = 1;
        self.upgradeToCommit = null;
        self.state_tb_migrated = null;
    }

    override fun getStateInternal(): Cell {
        return self.state.toCell();
    }

    override fun migrateDataIternal() {
        throw(3000); // This is the first version, so we don't need to migrate data
    }

    override fun step() {
        self.state.counter += 1;
    }

    override fun counter(): Int {
        return self.state.counter;
    }
}
