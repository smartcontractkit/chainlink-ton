import "../responder";
import "../../lib/upgradeable_blue_green";

message(1) Step {
    queryId: Int as uint64;
}

trait UpgradeableGBCounter with UpgradableBG, Responder {
    id: Int as uint32;
    owner: Address;
    _prev_version: Int as uint32; // Previous version
    _blue_version: Int as uint32; // Active version
    _green_version: Int as uint32; // New version
    code_bkup: Cell?;
    code: Cell;
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
