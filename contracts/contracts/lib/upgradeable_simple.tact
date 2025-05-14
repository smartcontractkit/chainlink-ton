import "@stdlib/ownable";

/// Message for upgrading contract code and data.
message(10) Upgrade {
    code: Cell;
}

/// Implements a basic upgrade mechanism with owner validation.
trait UpgradableSimple with Ownable {
    /// Contract owner address that can perform upgrades.
    owner: Address;

    /// Current contract version, auto-increments after each upgrade.
    /// Meant to be private and only accessible through the relevant getter.
    _version: Int as uint32;

    /// Checks the sender, performs an upgrade, and increments the version.
    receive(msg: Upgrade) {
        let ctx = context();
        self.requireValidateUpgrade(ctx, msg);
        self.upgrade(ctx, msg);

        self._version += 1;
    }

    inline fun requireValidateUpgrade(_: Context, __: Upgrade) {
        self.requireOwner();
    }

    virtual inline fun upgrade(_: Context, msg: Upgrade) {
        setCode(msg.code);
    }

    /// A getter to check if the contract uses this trait.
    get fun isUpgradable(): Bool {
        return true;
    }

    /// A getter returning the current version of the contract.
    get fun version(): Int {
        return self._version;
    }
}

/// Change of code will be applied by the end of the current transaction.
asm fun setCode(code: Cell) { SETCODE }

/// Change of data is immediate.
asm fun setData(data: Cell) { c4 POP }
