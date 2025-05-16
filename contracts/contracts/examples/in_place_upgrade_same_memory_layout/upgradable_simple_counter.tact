import "@stdlib/ownable";
import "../../lib/upgradable_simple";
import "../responder";
import "../counter_trait";

/// This is a counter that implements UpgradableSimple trait.
/// It is able to be upgraded in place as long as the memory layout is the same.
trait UpgradableSimpleCounter with Responder, ICounter, UpgradableSimple {
    /// --- UpgradableSimple Attributes ---
    /// Contract owner address that can perform upgrades.
    owner: Address;

    /// --- UpgradableSimpleCounter Attributes ---

    /// Counter id
    id: Int as uint32;
    /// Counter value
    counter: Int as uint32;

    /// --- UpgradableSimpleCounter Functions ---

    get fun id(): Int {
        return self.id;
    }

    get fun counter(): Int {
        return self.counter;
    }

    /// --- ICounter Functions ---

    /// Handle step instruction
    override fun handle_step(queryId: Int) {
        self.step();
    }

    /// --- Delegated ICounter Functions ---

    /// Update counter
    abstract fun step();

    /// --- Responder Functions ---

    /// Respond to a request, returning a value to the sender() in the callbackOpcode.
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

    /// --- UpgradableSimple Functions ---

    /// Type must be a TitleCase string that is uinique to the contract and should not change betwen versions.
    override fun upgradableType(): String {
        return "UpgradableSimpleCounter";
    }

    /// Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    override fun upgradableVersion(): String {
        return self.upgradableSimpleCounterVersion();
    }

    /// --- Delegated UpgradableSimple Functions ---

    /// Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    abstract fun upgradableSimpleCounterVersion(): String;
}
