import "../../lib/upgradable";
import "../responder";
import "../counter_trait";

trait UpgradableCounter with Upgradable, Responder, ICounter {
    /// Ownable
    owner: Address;

    /// Upgradable
    /// New version
    upgradeToCommit: Upgrade?;

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

    abstract fun counter(): Int;

    override fun getState(): Cell {
        return self.getStateInternal();
    }

    abstract fun getStateInternal(): Cell;

    override fun upgradableType(): String {
        return "UpgradableCounter";
    }

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    override fun upgradableVersion(): String {
        return self.upgradableCounterVersion();
    }

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    abstract fun upgradableCounterVersion(): String;
}
