import "../../../../lib/access/ownable_2step.tolk";
import "../../../../lib/funding/withdrawable.tolk";

struct Storage {
    id: uint32;
    ownable2Step: Ownable2Step;
    reserve: coins;
}
