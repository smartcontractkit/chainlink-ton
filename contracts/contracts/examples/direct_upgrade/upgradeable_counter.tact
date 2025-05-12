import "../responder";
import "@stdlib/ownable";
import "../../lib/upgradeable";

message(1) Step {
    queryId: Int as uint64;
}

trait UpgradeableCounter with Upgradable, Ownable, Responder {
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

    override fun getResponse(): Int {
        return self.counter;
    }

    get fun counter(): Int {
        return self.counter;
    }

    get fun id(): Int {
        return self.id;
    }
}
