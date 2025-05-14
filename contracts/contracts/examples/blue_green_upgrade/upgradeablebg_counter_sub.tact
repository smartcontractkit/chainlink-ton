import "./upgradeablebg_counter";
import "./upgradeablebg_counter_add";
import "../../lib/upgradeable_blue_green";

struct StateV2 {
    counter: Int as uint64;
    id: Int as uint32;
}

contract UpgradeableGBCounterSub with UpgradeableGBCounter {
    /// Ownable
    owner: Address;

    /// UpgradableBG
    /// New version
    _version: Int as uint32;
    upgradeToCommit: Upgrade?;

    // Counter
    state: StateV2;

    init(
        initParams: InitParams,
    ) {
        self.owner = initParams.header.owner;
        self._version = initParams.header._version + 1;
        self.upgradeToCommit = null;
        let stateV1 = StateV1.fromCell(initParams.stateToBeMigrated);
        self.state = StateV2 {
            id: stateV1.id,
            counter: stateV1.counter,
        };
        dump("Migration completed");
    }

    override fun getStateInternal(): Cell {
        return self.state.toCell();
    }

    override fun step() {
        self.state.counter -= 1;
    }

    override fun counter(): Int {
        return self.state.counter;
    }
}
