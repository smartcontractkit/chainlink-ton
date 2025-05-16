import "../../lib/upgradable";
import "./upgradable_counter_add";
import "./upgradable_counter";

struct StateV2 {
    counter: Int as uint64;
    id: Int as uint32;
}

contract UpgradableCounterSub with UpgradableCounter {
    /// Ownable
    owner: Address;

    /// UpgradableBG
    /// New version
    upgradeToCommit: Upgrade?;

    // Counter
    state: StateV2;

    init(
        initParams: InitParams,
    ) {
        self.owner = initParams.header.owner;
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

    override fun upgradableCounterVersion(): String {
        return "2.0.0";
    }
}
