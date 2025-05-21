import "../responder";
import "../counter_trait";
import "./upgradable_proxy_child";

/// This is a counter that implements UpgradableProxyChild trait.
trait UpgradableProxyChildCounter with Responder, ICounter, UpgradableProxyChild {
    /// --- UpgradableProxyChild Attributes ---
    /// Contract owner address that can perform upgrades.
    owner: Address;

    /// --- ICounter Functions ---

    /// Handle step instruction
    override fun handle_step(queryId: Int) {
        self.step(queryId);
    }

    /// --- Delegated ICounter Functions ---

    /// Update counter
    abstract fun step(queryId: Int);

    /// --- Responder Functions ---

    /// Respond to a request, returning a value to the sender() in the callbackOpcode.
    override fun respond(msg: Request, sender: Address) {
        message(MessageParameters {
            mode: SendRemainingValue,
            body: beginCell()
                .storeUint(msg.callbackOpcode, 32)
                .storeUint(msg.queryId, 64)
                .storeUint(self.value(), 64)
                .endCell(),
            value: 0,
            to: sender(),
            bounce: true,
        });
    }

    abstract fun value(): Int;

    /// --- Upgradable Functions ---

    /// Returns the current state of the contract.
    /// This function is used to migrate the state from the old version to the new one.
    override fun getState(): Cell {
        return self.getCounterState();
    }

    /// --- Deletaed Upgradable Functions ---

    /// Returns the current state of the contract.
    abstract fun getCounterState(): Cell;
}
