import "@stdlib/ownable";
import "../../lib/upgradeable";
import "./upgradeable_counter.tact";

contract UpgradeableCounterSub(
    id: Int as uint32,
    owner: Address,
    counter: Int as uint32,
) with UpgradeableCounter {
    override fun step() {
        self.counter -= 1;
    }

    override fun upgradeableCounterVersion(): String {
        return "2.0.0";
    }
}
