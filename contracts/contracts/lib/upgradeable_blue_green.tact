import "@stdlib/ownable";

/// Message for upgrading contract code and data.
message(10) Upgrade {
    /// New code of the contract.
    /// Defaults to `null`, which keeps the previous code.
    code: Cell? = null;

    /// New data of the contract.
    /// Defaults to `null`, which keeps the previous data.
    data: Cell? = null;
}

message(11) CommitUpgrade {}

message(12) RollbackUpgrade {}

const UpgradeCommited: Int = 1001;

/// Implements a blue/green upgrade mechanism with owner validation.
trait UpgradableBG with Ownable {
    /// Contract owner address that can perform upgrades.
    owner: Address;

    /// Current contract version, auto-increments after each upgrade.
    /// Meant to be private and only accessible through the relevant getter.
    _prev_version: Int as uint32;
    _blue_version: Int as uint32;
    _green_version: Int as uint32;
    code_bkup: Cell?;
    data_bkup: Cell?;
    code: Cell;
    data: Cell;

    virtual inline fun requireValidateUpgrade(_: Context, __: Upgrade) {
        self.requireOwner();
    }

    receive(msg: Upgrade) {
        let ctx = context();
        self.requireValidateUpgrade(ctx, msg);
        self.code_bkup = msg.code;
        self.data_bkup = msg.data;

        self._green_version = self._blue_version + 1;
    }

    virtual inline fun requireValidateCommitUpgrade(_: Context, __: CommitUpgrade) {
        self.requireOwner();
    }

    receive(msg: CommitUpgrade) {
        dump("CommitUpgrade");
        let ctx = context();
        self.requireValidateCommitUpgrade(ctx, msg);
        let code = self.code_bkup;
        let data = self.data_bkup;
        self.code_bkup = self.code;
        self.data_bkup = self.data;

        self._prev_version = self._blue_version;
        self._blue_version = self._green_version;
        self.upgrade(ctx, code, data);
    }

    virtual inline fun requireValidateRollbackUpgrade(_: Context, __: RollbackUpgrade) {
        self.requireOwner();
    }

    receive(msg: RollbackUpgrade) {
        dump("RollbackUpgrade");
        let ctx = context();
        self.requireValidateRollbackUpgrade(ctx, msg);
        let code = self.code_bkup;
        let data = self.data_bkup;
        self.code_bkup = self.code;
        self.data_bkup = self.data;

        self._blue_version = self._prev_version;
        self.upgrade(ctx, code, data);
    }

    /// Sets the code if it's not `null`.
    /// Sets the data if it's not `null`.
    /// Can be overridden.
    virtual inline fun upgrade(_: Context, code: Cell?, data: Cell?) {
        if (code != null) {
            // Change of code will be applied at the end of this transaction

            self.code = code!!;
            setCode(code!!);
        }
        if (data != null) {
            // Change of data will be immediate
            self.data = data!!;
            setData(data!!);

            // By the end of every transaction,
            // the Tact compiler automatically adds a call to setData() for your convenience.
            // However, we've already set the data ourselves,
            // so let's stop the execution now to prevent a secondary call to setData().
            throw(0);
        }
    }

    /// A getter to check if the contract uses this trait.
    get fun isUpgradable(): Bool {
        return true;
    }

    /// A getter returning the current version of the contract.
    get fun version(): Int {
        return self._blue_version;
    }
}

/// Change of code will be applied by the end of the current transaction.
asm fun setCode(code: Cell) { SETCODE }

/// Change of data is immediate.
asm fun setData(data: Cell) { c4 POP }
