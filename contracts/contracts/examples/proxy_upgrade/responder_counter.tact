import "@stdlib/ownable";
import "../responder";
import "./counter_trait";

trait ResponderCounter with Ownable, Responder, ICounter {
    id: Int as uint32;
    owner: Address;
    _version: Int as uint32;
    counter: Int as uint32;

    override fun handle_step(queryId: Int) {
        self.step(queryId);
    }

    abstract fun step(queryId: Int);

    override fun respond(msg: Request, sender: Address) {
        message(MessageParameters {
            mode: SendRemainingValue,
            body: beginCell()
                .storeUint(msg.callbackOpcode, 32)
                .storeUint(msg.queryId, 64)
                .storeUint(self.counter, 64)
                .endCell(),
            value: 0,
            to: sender(),
            bounce: true,
        });
    }

    get fun counter(): Int {
        return self.counter;
    }

    get fun id(): Int {
        return self.id;
    }
}
