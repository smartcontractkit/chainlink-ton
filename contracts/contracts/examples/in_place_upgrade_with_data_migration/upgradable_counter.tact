import "../../lib/upgradable";
import "../responder";
import "../counter_trait";

/// This is a counter that implements Upgradable trait.
/// It is able to be upgraded in place and migrate the data layout.
trait UpgradableCounter with Responder, ICounter, Upgradable {
    /// --- Upgradable Attributes ---
    /// Contract owner address that can perform upgrades.
    owner: Address;

    /// This is the code that will be used to upgrade the contract.
    upgradeToCommit: Upgrade?;

    /// --- UpgradableCounter Functions ---

    /// Gets the current counter value.
    abstract fun counter(): Int;

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

    /// --- Upgradable Functions ---

    /// Returns the current state of the contract.
    /// This function is used to migrate the state from the old version to the new one.
    override fun getState(): Cell {
        return self.getStateInternal();
    }

    /// Type must be a TitleCase string that is uinique to the contract and should not change betwen versions.
    override fun upgradableType(): String {
        return "UpgradableCounter";
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
