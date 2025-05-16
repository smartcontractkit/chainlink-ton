import "../../lib/upgradable";
import "./upgradable_proxy_child_counter";
import "./upgradable_proxy_child_counter_add";

struct SateV2 {
    counter: Int as uint64;
    id: Int as uint32;
}

contract UpgradableProxyChildCounterSub with UpgradableProxyChildCounter {
    /// Ownable
    owner: Address;

    /// Upgradable
    /// New version
    upgradeToCommit: Upgrade?;

    /// Counter
    counter: Int as uint64;
    id: Int as uint32;

    init(
        initParams: InitParams,
    ) {
        self.owner = initParams.header.owner;
        let stateV1 = SateV1.fromCell(initParams.stateToBeMigrated);
        self.id = stateV1.id;
        self.counter = stateV1.counter;
        message(MessageParameters {
            mode: SendPayGasSeparately,
            body: UpdateCounterVersion {
                version: "2.0.0",
            }.toCell(),
            value: 1,
            to: initParams.header.owner,
            bounce: true,
        });
    }

    override fun step(queryId: Int) {
        self.counter -= 1;
    }

    override fun counter(): Int {
        return self.counter;
    }

    override fun getCounterState(): Cell {
        return SateV2 {
            counter: self.counter,
            id: self.id,
        }.toCell();
    }
}
