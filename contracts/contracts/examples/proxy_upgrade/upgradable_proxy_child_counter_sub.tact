import "../../lib/upgradable";
import "./upgradable_proxy_child_counter";
import "./upgradable_proxy_child_counter_add";

/// Counter State version 2
struct StateV2 {
    /// Counter value
    counter: Int as uint64;
    /// Counter id
    id: Int as uint32;
}

/// This is version 2.0.0 of the UpgradableCounter contract, which subtracts 1 to the counter on each step, instead of adding 1.
contract UpgradableProxyChildCounterSub with UpgradableProxyChildCounter {
    /// --- UpgradableCounter Attributes ---
    /// Contract owner
    owner: Address;

    /// --- UpgradableCounter Attributes ---

    /// Counter State
    state: StateV2;

    init(
        initParams: InitParams,
    ) {
        self.owner = initParams.header.owner;
        let stateV1 = StateV1.fromCell(initParams.stateToBeMigrated);
        self.state = StateV2 {
            counter: stateV1.counter,
            id: stateV1.id,
        };
        message(MessageParameters {
            mode: SendPayGasSeparately,
            body: UpdateCounterVersion {
                version: "2.0.0",
            }.toCell(),
            value: 1,
            to: sender(),
            bounce: true,
        });
    }

    /// --- UpgradableCounter Functions ---

    /// Returns the current state of the contract.
    override fun getCounterState(): Cell {
        return self.state.toCell();
    }

    /// Update counter
    override fun step(queryId: Int) {
        self.state.counter -= 1;
    }

    /// Gets the current counter value.
    override fun counter(): Int {
        return self.state.counter;
    }
}
