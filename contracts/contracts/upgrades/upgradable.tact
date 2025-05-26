import "@stdlib/ownable";
import "../lib/type_and_version";

/// Message for upgrading a contract.
message(10) Upgrade {
    code: Cell;
}

/// Storage Cell layout for the initialization of the new version.
struct LazyDeploymentLayout {
    /// for contracts with init() function
    lazyDeploymentBit: Bool;
    /// state to be migrated
    data: Cell;
}

/// Implements a two step upgrade mechanism with data migration.
trait Upgradable with Ownable, TypeAndVersion {
    /// --- Ownable Attributes ---
    /// Contract owner address that can perform upgrades.
    owner: Address;

    /// --- Upgradable Functions ---
    ///
    virtual inline fun requireValidateUpgrade(_: Context, __: Upgrade) {
        self.requireOwner();
    }

    receive(msg: Upgrade) {
        let ctx = context();
        self.requireValidateUpgrade(ctx, msg);
        self.upgrade(ctx, msg);
    }

    /// Applies the upgrade to the contract.
    virtual inline fun upgrade(_: Context, _upgrade: Upgrade) {
        setCode(_upgrade.code);
        let initParams = LazyDeploymentLayout {
            lazyDeploymentBit: false, // must be false for the init function to be called
            data: getData(),
        }.toCell();
        setData(initParams);

        // By the end of every transaction, the Tact compiler automatically
        // adds a call to setData(). However, we've already set the data
        // ourselves, so we must stop the execution now to prevent a secondary
        // call to setData().
        throw(0);
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

    // Type must be a Reverse Domain Name Notation string that is unique to the contract and should not change betwen versions.
    // Example: "com.chainlink.project.package.ContractName"
    // Read more about Reverse DNS Notation at https://en.wikipedia.org/wiki/Reverse_domain_name_notation
    override fun type(): String {
        return self.upgradableType();
    }

    /// --- Delegated TypeAndVersion Functions ---

    /// Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    abstract fun upgradableVersion(): String;

    // Type must be a Reverse Domain Name Notation string that is unique to the contract and should not change betwen versions.
    // Example: "com.chainlink.project.package.ContractName"
    // Read more about Reverse DNS Notation at https://en.wikipedia.org/wiki/Reverse_domain_name_notation
    abstract fun upgradableType(): String;
}

/// Changes the code of the contract.
/// It will be applied by the end of the current transaction.
asm fun setCode(code: Cell) { SETCODE }

/// Changes the storage cell of the contract.
/// The change is immediate, but the attributes won't be repopulated.
asm fun setData(data: Cell) { c4 POP }

/// Returns the current storage cell of the contract.
@name(get_data)
native getData(): Cell;
