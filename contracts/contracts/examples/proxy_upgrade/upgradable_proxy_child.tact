import "@stdlib/ownable";
import "./proxy_counter";

message(40) GetState {}

trait UpgradableProxyChild with Ownable {
    owner: Address;

    receive(msg: GetState) {
        message(MessageParameters {
            mode: SendRemainingValue,
            body: RequestedState {
                stateToBeMigrated: self.getState(),
            }.toCell(),
            value: 0,
            to: sender(),
            bounce: true,
        });
    }

    abstract fun getState(): Cell;
}
