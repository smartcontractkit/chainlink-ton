import "./upgradeablebg_counter";

contract UpgradeableGBCounterAdd with UpgradeableGBCounter {
    id: Int as uint32;
    owner: Address;
    counter: Int as uint32;
    _prev_version: Int as uint32; // Previous version
    _blue_version: Int as uint32; // Active version
    _green_version: Int as uint32; // New version
    code_bkup: Cell?;
    data_bkup: Cell?;
    code: Cell;
    data: Cell;

    init(
        id: Int,
        owner: Address,
        version: Int,
        counter: Int,
    ) {
        self.id = id;
        self.owner = owner;
        self._prev_version = version;
        self._blue_version = version;
        self._green_version = version;
        self.counter = counter;
        self.code_bkup = null;
        self.data_bkup = null;
        self.code = codeOf UpgradeableGBCounterAdd;
        self.data = (initOf UpgradeableGBCounterAdd(id, owner, version, counter)).toCell();
    }

    override fun step() {
        self.counter += 1;
    }
}
