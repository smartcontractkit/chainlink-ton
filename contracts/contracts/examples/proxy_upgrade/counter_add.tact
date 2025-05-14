import "./responder_counter";

contract ResponderCounterAdd with ResponderCounter {
    id: Int as uint32;
    owner: Address;
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
}
