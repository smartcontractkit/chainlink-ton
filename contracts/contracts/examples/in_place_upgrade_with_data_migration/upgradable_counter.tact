import "../../lib/upgradable";
import "../direct_responder";
import "../counter_trait";

/// This is a counter that implements Upgradable trait.
/// It is able to be upgraded in place and migrate the data layout.
trait UpgradableCounter with DirectResponder, ICounter, Upgradable {
    /// --- Upgradable Attributes ---
    /// Contract owner address that can perform upgrades.
    owner: Address;

    /// This is the code that will be used to upgrade the contract.
    upgradeToCommit: Upgrade?;

    /// --- UpgradableCounter Functions ---

    /// Gets the current counter value.
    abstract fun value(): Int;

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

    /// --- Upgradable Functions ---

    /// Returns the current state of the contract.
    /// This function is used to migrate the state from the old version to the new one.
    override fun getState(): Cell {
        return self.getStateInternal();
    }

    // Type must be a Reverse Domain Name Notation string that is uinique to the contract and should not change betwen versions.
    // Example: "com.chainlink.project.package.ContractName"
    // Read more about Reverse DNS Notation at https://en.wikipedia.org/wiki/Reverse_domain_name_notation
    override fun upgradableType(): String {
        return "com.chainlink.ton.examples.in_place_upgrade_with_data_migration.UpgradableCounter";
    }

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    override fun upgradableVersion(): String {
        return self.upgradableCounterVersion();
    }
    /// --- Deletaed Upgradable Functions ---

    /// Returns the current state of the contract.
    abstract fun getStateInternal(): Cell;

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    abstract fun upgradableCounterVersion(): String;
}
