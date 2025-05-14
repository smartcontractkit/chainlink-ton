import "./upgradeablebg_counter";
import "./upgradeablebg_counter_add";
import "../../lib/upgradeable_blue_green";

struct StateV2 {
    counter: Int as uint64;
    id: Int as uint32;
}

contract UpgradeableGBCounterSub(
    /// Ownable
    owner: Address,

    /// UpgradableBG
    /// New version
    _version: Int as uint32,
    upgradeToCommit: Upgrade?,
    state_tb_migrated: Cell?,

    // Counter
    state: StateV2,
) with UpgradeableGBCounter {
    // init(
    //     id: Int,
    //     owner: Address,
    //     counter: Int,
    // ) {
    //     self.owner = owner;
    //     self.state = StateV2 {
    //         counter: counter,
    //         id: id,
    //     };
    //     self._version = 1;
    //     self.upgradeToCommit = null;
    //     self.state_tb_migrated = null;
    // }
    override fun getStateInternal(): Cell {
        return self.state.toCell();
    }

    override fun migrateDataIternal() {
        let stateV1 = StateV1.fromCell(self.state_tb_migrated);
        self.state = StateV2 {
            id: stateV1.id,
            counter: stateV1.counter,
        };
        self.state_tb_migrated = null;
    }

    override fun step() {
        self.state.counter -= 1;
    }

    override fun counter(): Int {
        return self.state.counter;
    }
}
