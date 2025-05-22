import "../../lib/upgradable";
import "../step_counter";

/// This is a StepCounter that implements Upgradable trait.
/// It is able to be upgraded in place and migrate the data layout.
trait UpgradableCounter with StepCounter, Upgradable {
    /// --- Upgradable Attributes ---
    /// Contract owner address that can perform upgrades.
    owner: Address;

    /// --- UpgradableCounter Functions ---

    /// --- StepCounter Functions ---

    /// Handle step instruction

    /// --- Upgradable Functions ---

    // Type must be a Reverse Domain Name Notation string that is uinique to the contract and should not change betwen versions.
    // Example: "com.chainlink.project.package.ContractName"
    // Read more about Reverse DNS Notation at https://en.wikipedia.org/wiki/Reverse_domain_name_notation
    override fun upgradableType(): String {
        return "com.chainlink.ton.examples.upgradable_counter.UpgradableCounter";
    }

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    override fun upgradableVersion(): String {
        return self.upgradableCounterVersion();
    }

    /// --- Deletaed Upgradable Functions ---

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    abstract fun upgradableCounterVersion(): String;
}
