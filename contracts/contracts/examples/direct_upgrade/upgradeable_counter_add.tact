import "./upgradeable.tact";
import "./upgradeable_counter.tact";
import "@stdlib/ownable";

contract UpgradeableCounterAdd(
    id: Int as uint32,
    owner: Address,
    _version: Int as uint32,
    counter: Int as uint32,
) with Upgradable, Ownable, UpgradeableCounter {
    override fun step() {
        self.counter += 1;
    }
}
