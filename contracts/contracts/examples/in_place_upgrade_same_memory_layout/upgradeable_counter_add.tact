import "./upgradeable_counter.tact";

contract UpgradeableCounterAdd with UpgradeableSimpleCounter {
    id: Int as uint32;
    padding: Int as uint32;
    owner: Address;
    _version: Int as uint32;
    counter: Int as uint32;

    init(
        id: Int,
        owner: Address,
        _version: Int,
        counter: Int,
    ) {
        self.id = id;
        self.padding = 0;
        self.owner = owner;
        self._version = _version;
        self.counter = counter;
    }

    override fun step() {
        self.counter += 1;
    }
}
