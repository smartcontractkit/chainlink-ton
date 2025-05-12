import "../responder";
import "../../lib/upgradeable_blue_green";

message(1) Step {
    queryId: Int as uint64;
}

trait UpgradeableGBCounter with UpgradableBG, Responder {
    // Counter
    id: Int as uint32;
    counter: Int as uint32;

    /// Ownable
    owner: Address;

    /// UpgradableBG

    /// Previous version
    _prev_version: Int as uint32;
    /// Active version
    _blue_version: Int as uint32;
    /// New version
    _green_version: Int as uint32;
    code_bkup: Cell?;
    data_bkup: Cell?;
    code: Cell;

    // Empty receiver for the deployment,
    // which expects the `null` message body
    receive() {
        cashback(sender());
    }

    receive(msg: Step) {
        self.step();

        cashback(sender());
    }

    override fun getData(): Cell {
        return beginCell()
            .storeUint(self.id, 32)
            .storeUint(self.counter, 32)
            .asCell();
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
