import "../../lib/upgradable";

/// Instructs the contract to step the counter.
message(1) Step {
    queryId: Int as uint64;
}

/// This is a Step Counter that implements Upgradable trait.
/// It is able to be upgraded in place and migrate the data layout.
///
/// - V1 adds 1 to the counter on each step.
/// - V2 subtracts 1 to the counter on each step.
trait UpgradableCounter with Upgradable {
    /// --- Upgradable Attributes ---
    /// Contract owner address that can perform upgrades.
    owner: Address;

    /// --- UpgradableCounter Functions ---

    /// Empty receiver for the deployment,
    /// which expects the `null` message body
    receive() {
        cashback(sender());
    }

    /// Step the counter
    receive(msg: Step) {
        self.step();
        cashback(sender());
    }

    /// Handle step instruction
    /// This function should be overridden in the derived contract
    virtual fun step() {
        throw(1000); // This function should be overridden in the derived contract
    }

    /// Gets the current counter value.
    /// This function should be overridden in the derived contract
    get virtual fun value(): Int {
        throw(1000);
    }

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
