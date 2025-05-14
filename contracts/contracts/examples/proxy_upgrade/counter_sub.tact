import "./responder_counter";
import "./proxy_counter";
import "@stdlib/ownable";

contract ResponderCounterSub with ResponderCounter {
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
        message(MessageParameters {
            mode: SendPayGasSeparately,
            body: UpdateCounterVersion {
                version: "2.0.0",
            }.toCell(),
            value: 1,
            to: owner,
            bounce: true,
        });
        dump("CounterSub init");
        dump(owner);
    }

    override fun step(queryId: Int) {
        self.counter -= 1;
    }
}
