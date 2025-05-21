import "./upgradable_proxy_child_counter";

/// Counter State version 1
struct StateV1 {
    /// Counter id
    id: Int as uint32;
    /// Counter value
    value: Int as uint32;
}

/// This is version 1.0.0 of the UpgradableProxyChildCounterAdd contract, which adds 1 to the counter on each step.
contract UpgradableProxyChildCounterAdd with UpgradableProxyChildCounter {
    /// --- UpgradableProxyChildCounter Attributes ---
    /// Contract owner
    owner: Address;

    /// --- UpgradableProxyChildCounterAdd Attributes ---

    /// Counter State
    state: StateV1;

    init(
        id: Int,
        owner: Address,
        counter: Int,
    ) {
        self.owner = owner;
        self.state = StateV1 {
            id: id,
            value: counter,
        };
    }

    /// --- UpgradableProxyChildCounter Functions ---

    /// Returns the current state of the contract.
    override fun getCounterState(): Cell {
        return self.state.toCell();
    }

    /// Update counter
    override fun step(queryId: Int) {
        self.state.value += 1;
    }

    /// Gets the current counter value.
    override fun value(): Int {
        return self.state.value;
    }
}
