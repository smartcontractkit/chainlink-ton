import "./responder_counter";

contract ResponderCounterAdd with ResponderCounter {
    id: Int as uint32;
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
        self.owner = owner;
        self._version = _version;
        self.counter = counter;
    }

    override fun step(queryId: Int) {
        self.counter += 1;
    }
}
