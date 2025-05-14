import "../../lib/upgradeable";
import "./upgradeable_counter.tact";
import "@stdlib/ownable";

contract UpgradeableCounterAdd(
    id: Int as uint32,
    owner: Address,
    _version: Int as uint32,
    counter: Int as uint32,
) with Ownable, Upgradable, UpgradeableCounter {
    override fun step() {
        self.counter += 1;
    }
}
