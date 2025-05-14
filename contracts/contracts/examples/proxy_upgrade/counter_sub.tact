import "../../lib/upgradeable";
import "./responder_counter";
import "./upgradeable_proxy_child";
import "./counter_add";

struct SateV2 {
    counter: Int as uint64;
    id: Int as uint32;
}

contract ResponderCounterSub with ResponderCounter, UpgradeableProxyChild {
    /// Ownable
    owner: Address;

    /// Upgradable
    /// New version
    _version: Int as uint32;
    upgradeToCommit: Upgrade?;

    /// Counter
    counter: Int as uint64;
    id: Int as uint32;

    init(
        initParams: InitParams,
    ) {
        self.owner = initParams.header.owner;
        self._version = initParams.header._version;
        let stateV1 = SateV1.fromCell(initParams.stateToBeMigrated);
        self.id = stateV1.id;
        self.counter = stateV1.counter;
    }

    override fun step(queryId: Int) {
        self.counter -= 1;
    }

    override fun counter(): Int {
        return self.counter;
    }

    override fun getState(): Cell {
        return SateV2 {
            counter: self.counter,
            id: self.id,
        }.toCell();
    }
}
