import "@stdlib/ownable";
import "../../lib/upgradeable";
import "./upgradeable_counter.tact";

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
