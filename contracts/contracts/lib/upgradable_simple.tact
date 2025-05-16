import "@stdlib/ownable";
import "./type_and_version";

/// Message for upgrading contract code and data.
message(10) Upgrade {
    code: Cell;
}

/// Implements a basic upgrade mechanism with owner validation.
trait UpgradableSimple with Ownable, TypeAndVersion {
    /// --- Ownable Attributes ---
    /// Contract owner address that can perform upgrades.
    owner: Address;

    inline fun requireValidateUpgrade(_: Context, __: Upgrade) {
        self.requireOwner();
    }

    /// Checks the sender, performs an upgrade, and increments the version.
    receive(msg: Upgrade) {
        let ctx = context();
        self.requireValidateUpgrade(ctx, msg);
        self.upgrade(ctx, msg);
    }

    /// Applies the upgrade to the contract.
    virtual inline fun upgrade(_: Context, msg: Upgrade) {
        // Direcly switch to the new code.
        setCode(msg.code);
    }

    /// A getter to check if the contract uses this trait.
    get fun isUpgradable(): Bool {
        return true;
    }

    /// --- TypeAndVersion Functions ---

    /// Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    override fun version(): String {
        return self.upgradableVersion();
    }

    /// Type must be a TitleCase string that is uinique to the contract and should not change betwen versions.
    override fun type(): String {
        return self.upgradableType();
    }

    /// --- Delegated TypeAndVersion Functions ---

    /// Type must be a TitleCase string that is uinique to the contract and should not change betwen versions.
    abstract fun upgradableType(): String;

    /// Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    abstract fun upgradableVersion(): String;
}

/// Change of code will be applied by the end of the current transaction.
asm fun setCode(code: Cell) { SETCODE }

/// Change of data is immediate.
asm fun setData(data: Cell) { c4 POP }
