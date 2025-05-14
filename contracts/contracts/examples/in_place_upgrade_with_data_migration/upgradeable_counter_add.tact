import "./upgradeable_counter";

struct StateV1 {
    id: Int as uint32;
    counter: Int as uint32;
}

contract UpgradeableCounterAdd with UpgradeableCounter {
    /// Ownable
    owner: Address;

    /// UpgradableBG
    /// New version
    _version: Int as uint32;
    upgradeToCommit: Upgrade?;

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
    }

    override fun getStateInternal(): Cell {
        return self.state.toCell();
    }

    override fun step() {
        self.state.counter += 1;
    }

    override fun counter(): Int {
        return self.state.counter;
    }
}
