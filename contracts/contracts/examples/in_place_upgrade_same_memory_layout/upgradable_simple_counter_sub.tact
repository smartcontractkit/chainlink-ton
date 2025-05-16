import "./upgradable_simple_counter.tact";

contract UpgradableSimpleCounterSub with UpgradableSimpleCounter {
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

    /// impl UpgradableSimpleCounter
    /// ============================

    override fun upgradableSimpleCounterVersion(): String {
        return "2.0.0";
    }

    override fun step() {
        self.counter -= 1;
    }
}
