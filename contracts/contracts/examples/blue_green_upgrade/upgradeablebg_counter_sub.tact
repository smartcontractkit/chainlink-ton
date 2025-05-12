import "./upgradeablebg_counter";

contract UpgradeableGBCounterSub with UpgradeableGBCounter {
    // Counter
    id: Int as uint32;
    counter: Int as uint32;

    /// Ownable
    owner: Address;

    /// UpgradableBG

    /// Previous version
    _prev_version: Int as uint32;
    /// Active version
    _blue_version: Int as uint32;
    /// New version
    _green_version: Int as uint32;
    code_bkup: Cell?;
    code: Cell;
    data_bkup: Cell?;

    init(
        id: Int,
        owner: Address,
        counter: Int,
    ) {
        self.id = id;
        self.counter = counter;
        self.owner = owner;
        self._prev_version = 1;
        self._blue_version = 1;
        self._green_version = 1;
        self.code_bkup = null;
        self.code = codeOf UpgradeableGBCounterSub;
        self.data_bkup = null;
    }

    override fun step() {
        self.counter -= 1;
    }
}
