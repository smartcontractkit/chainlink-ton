import "@stdlib/ownable";
import "../../lib/upgradeable_simple";
import "../responder";

message(1) Step {
    queryId: Int as uint64;
}

/// This is a counter that implements UpgradableSimple trait.
/// It is able to be upgraded in place as long as the memory layout is the same.
trait UpgradeableSimpleCounter with UpgradableSimple, Ownable, Responder {
    id: Int as uint32;
    owner: Address;
    _version: Int as uint32;
    counter: Int as uint32;

    // Empty receiver for the deployment,
    // which expects the `null` message body
    receive() {
        cashback(sender());
    }

    receive(msg: Step) {
        self.step();

        cashback(sender());
    }

    // Update counter
    abstract fun step();

    override fun respond(msg: Request, sender: Address) {
        message(MessageParameters {
            mode: SendRemainingValue,
            body: beginCell()
                .storeUint(msg.callbackOpcode, 32)
                .storeUint(msg.queryId, 64)
                .storeUint(self.counter(), 64)
                .endCell(),
            value: 0,
            to: sender,
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
