import "@stdlib/ownable";
import "./type_and_version";

/// Message for upgrading contract code and data.
message(10) Upgrade {
    /// New code of the contract.
    /// Defaults to `null`, which keeps the previous code.
    code: Cell? = null;

    /// New data of the contract.
    /// Defaults to `null`, which keeps the previous data.
    data: Cell? = null;
}

/// Implements a basic upgrade mechanism with owner validation.
trait Upgradable with Ownable, TypeAndVersion {
    /// Contract owner address that can perform upgrades.
    owner: Address;

    /// Checks the sender, performs an upgrade, and increments the version.
    receive(msg: Upgrade) {
        let ctx = context();
        self.requireValidateUpgrade(ctx, msg);
        self.upgrade(ctx, msg);
    }

    /// Checks that the sender is the owner.
    /// Can be overridden.
    virtual inline fun requireValidateUpgrade(_: Context, __: Upgrade) {
        self.requireOwner();
    }

    /// Sets the code if it's not `null`.
    /// Sets the data if it's not `null`.
    /// Can be overridden.
    virtual inline fun upgrade(_: Context, msg: Upgrade) {
        if (msg.code != null) {
            // Change of code will be applied at the end of this transaction
            setCode(msg.code!!);
        }
        if (msg.data != null) {
            // Change of data will be immediate
            setData(msg.data!!);

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

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    override fun version(): String {
        return self.upgradeableVersion();
    }

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    abstract fun upgradeableVersion(): String;

    // Type must be a TitleCase string that is uinique to the contract and should not change betwen versions.
    override fun type(): String {
        return self.upgradeableType();
    }

    // Type must be a TitleCase string that is uinique to the contract and should not change betwen versions.
    abstract fun upgradeableType(): String;
}

/// Change of code will be applied by the end of the current transaction.
asm fun setCode(code: Cell) { SETCODE }

/// Change of data is immediate.
asm fun setData(data: Cell) { c4 POP }
