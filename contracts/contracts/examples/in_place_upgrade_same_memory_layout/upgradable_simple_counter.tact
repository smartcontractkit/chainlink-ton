import "../../lib/upgradable_simple";
import "../direct_responder";
import "../counter_trait";

/// This is a counter that implements UpgradableSimple trait.
/// It is able to be upgraded in place as long as the memory layout is the same.
trait UpgradableSimpleCounter with DirectResponder, StepCounter, UpgradableSimple {
    /// --- UpgradableSimple Attributes ---
    /// Contract owner address that can perform upgrades.
    owner: Address;

    /// --- UpgradableSimpleCounter Attributes ---

    /// Counter id
    id: Int as uint32;
    /// Counter value
    value: Int as uint32;

    /// --- UpgradableSimpleCounter Functions ---

    get fun id(): Int {
        return self.id;
    }

    get fun value(): Int {
        return self.value;
    }

    /// --- ICounter Functions ---

    /// Handle step instruction
    override fun handle_step(queryId: Int) {
        self.step();
    }

    /// --- Delegated ICounter Functions ---

    /// Update counter
    abstract fun step();

    /// --- DirectResponder Functions ---

    /// Respond to a request, returning a value to the sender() in the callbackOpcode.
    override fun storeValue(b: Builder): Builder {
        return b.storeUint(self.value(), 64);
    }

    /// --- UpgradableSimple Functions ---

    // Type must be a Reverse Domain Name Notation string that is uinique to the contract and should not change betwen versions.
    // Example: "com.chainlink.project.package.ContractName"
    // Read more about Reverse DNS Notation at https://en.wikipedia.org/wiki/Reverse_domain_name_notation
    override fun upgradableType(): String {
        return "com.chainlink.ton.examples.in_place_upgrade_same_memory_layout.UpgradableSimpleCounter";
    }

    /// Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    override fun upgradableVersion(): String {
        return self.upgradableSimpleCounterVersion();
    }

    /// --- Delegated UpgradableSimple Functions ---

    /// Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    abstract fun upgradableSimpleCounterVersion(): String;
}
