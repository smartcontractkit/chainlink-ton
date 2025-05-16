import "@stdlib/ownable";
import "../../lib/upgradable_simple";
import "../responder";
import "../counter_trait";

/// This is a counter that implements UpgradableSimple trait.
/// It is able to be upgraded in place as long as the memory layout is the same.
trait UpgradableSimpleCounter with Ownable, Responder, UpgradableSimple, ICounter {
    /// from Ownable
    owner: Address;

    /// New attributes

    id: Int as uint32;
    counter: Int as uint32;

    override fun handle_step(queryId: Int) {
        self.step();
    }

    /// Update counter
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

    override fun upgradableType(): String {
        return "UpgradableSimpleCounter";
    }

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    override fun upgradableVersion(): String {
        return self.upgradableSimpleCounterVersion();
    }

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    abstract fun upgradableSimpleCounterVersion(): String;

    get fun counter(): Int {
        return self.counter;
    }

    get fun id(): Int {
        return self.id;
    }
}
