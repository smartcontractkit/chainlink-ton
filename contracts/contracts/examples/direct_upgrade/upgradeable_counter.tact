import "@stdlib/ownable";
import "../../lib/upgradeable";
import "../responder";

message(1) Step {
    queryId: Int as uint64;
}

trait UpgradeableCounter with Upgradable, Responder {
    id: Int as uint32;
    owner: Address;
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
                .storeUint(self.counter, 64)
                .endCell(),
            value: 0,
            to: sender(),
            bounce: true,
        });
    }

    override fun upgradeableType(): String {
        return "UpgradeableCounter";
    }

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    override fun upgradeableVersion(): String {
        return self.upgradeableCounterVersion();
    }

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    abstract fun upgradeableCounterVersion(): String;

    get fun counter(): Int {
        return self.counter;
    }

    get fun id(): Int {
        return self.id;
    }
}
