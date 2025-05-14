import "@stdlib/ownable";

message(40) GetState {}

trait UpgradeableProxyChild with Ownable {
    owner: Address;

    receive(msg: GetState) {
        self.reply(self.getState());
    }

    abstract fun getState(): Cell;
}
