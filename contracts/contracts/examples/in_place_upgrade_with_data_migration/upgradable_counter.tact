import "../../lib/upgradable";
import "../responder";

message(1) Step {
    queryId: Int as uint64;
}

trait UpgradableCounter with Upgradable, Responder {
    /// Ownable
    owner: Address;

    /// Upgradable
    /// New version
    _version: Int as uint32;
    upgradeToCommit: Upgrade?;

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

    abstract fun counter(): Int;

    override fun getState(): Cell {
        return self.getStateInternal();
    }

    abstract fun getStateInternal(): Cell;
}
