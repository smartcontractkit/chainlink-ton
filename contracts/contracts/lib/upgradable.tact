import "@stdlib/ownable";
import "./type_and_version";

/// Message for upgrading a contract.
message(10) Upgrade {
    code: Cell;
}

/// Wrapper of the argumennts for the init function of the new version.
/// Includes a lazyInitBit that is always set to false.
/// This is needed for contracts that have an init() function.
struct InitParamsWrapper {
    lazyInitBit: Bool; /// This bit is always set to false. It is appended at the beginig of the cell for contracts that have an init() function.
    state: Cell; /// The initParams struct is used to pass the header and state to be migrated.
}

/// Wraps the InitParams struct into a cell for the init function of the new version.
fun wrapInitParams(state: Cell): Cell {
    return InitParamsWrapper {
        lazyInitBit: false,
        state: state,
    }.toCell();
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

    /// Returns the current state of the contract.
    /// This function is used to migrate the state from the old version to the new one.
    abstract fun getState(): Cell;

    /// Returns the header for the initialization of the new version.
    virtual fun getNextHeader(): HeaderUpgradable {
        return HeaderUpgradable {
            owner: self.owner,
        };
    }

    /// Applies the upgrade to the contract.
    virtual inline fun upgrade(_: Context, _upgrade: Upgrade) {
        // Change of code will be applied at the end of this transaction
        setCode(_upgrade.code);
        let initParams = wrapInitParams(getState());
        // Change of body will be immediate
        setData(initParams);

        // By the end of every transaction,
        // the Tact compiler automatically adds a call to setData() for your convenience.
        // However, we've already set the data ourselves,
        // so let's stop the execution now to prevent a secondary call to setData().
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

    // Type must be a Reverse Domain Name Notation string that is uinique to the contract and should not change betwen versions.
    // Example: "com.chainlink.project.package.ContractName"
    // Read more about Reverse DNS Notation at https://en.wikipedia.org/wiki/Reverse_domain_name_notation
    override fun type(): String {
        return self.upgradableType();
    }

    /// --- Delegated TypeAndVersion Functions ---

    /// Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    abstract fun upgradableVersion(): String;

    // Type must be a Reverse Domain Name Notation string that is uinique to the contract and should not change betwen versions.
    // Example: "com.chainlink.project.package.ContractName"
    // Read more about Reverse DNS Notation at https://en.wikipedia.org/wiki/Reverse_domain_name_notation
    abstract fun upgradableType(): String;
}

/// Change of code will be applied by the end of the current transaction.
asm fun setCode(code: Cell) { SETCODE }

/// Change of data is immediate.
asm fun setData(data: Cell) { c4 POP }
