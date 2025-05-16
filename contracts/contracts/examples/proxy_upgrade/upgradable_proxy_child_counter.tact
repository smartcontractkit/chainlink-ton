import "../responder";
import "../counter_trait";
import "./upgradable_proxy_child";

trait UpgradableProxyChildCounter with Responder, ICounter, UpgradableProxyChild {
    /// Ownable
    owner: Address;

    override fun handle_step(queryId: Int) {
        self.step(queryId);
    }

    abstract fun step(queryId: Int);

    override fun respond(msg: Request, sender: Address) {
        message(MessageParameters {
            mode: SendRemainingValue,
            body: beginCell()
                .storeUint(msg.callbackOpcode, 32)
                .storeUint(msg.queryId, 64)
                .storeUint(self.counter(), 64)
                .endCell(),
            value: 0,
            to: sender(),
            bounce: true,
        });
    }

    abstract fun counter(): Int;

    override fun getState(): Cell {
        return self.getCounterState();
    }

    abstract fun getCounterState(): Cell;
}
