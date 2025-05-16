import "./upgradable_proxy_child_counter";

struct SateV1 {
    id: Int as uint32;
    counter: Int as uint32;
}

contract UpgradableProxyChildCounterAdd with UpgradableProxyChildCounter {
    /// Ownable
    owner: Address;

    id: Int as uint32;
    counter: Int as uint32;

    init(
        id: Int,
        owner: Address,
        counter: Int,
    ) {
        self.id = id;
        self.owner = owner;
        self.counter = counter;
    }

    override fun step(queryId: Int) {
        self.counter += 1;
    }

    override fun counter(): Int {
        return self.counter;
    }

    override fun getCounterState(): Cell {
        return SateV1 {
            id: self.id,
            counter: self.counter,
        }.toCell();
    }
}
