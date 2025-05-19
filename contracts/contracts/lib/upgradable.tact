import "@stdlib/ownable";
import "./type_and_version";

/// Message for preparing the upgrade of a contract.
message(10) Upgrade {
    code: Cell;
}

/// Message for committing the upgrade of a contract.
message(11) CommitUpgrade {}

/// Message for rolling back the upgrade of a contract.
/// TODO: Not impelemented yet.
message(12) RollbackUpgrade {}

/// This are the internal variables all upgradable contracts should have.
/// It is used to migrate the state from the old version to the new one.
struct HeaderUpgradable {
    owner: Address; /// Owner of the contract.
}

/// Argument for the init function of the new version.
struct InitParams {
    header: HeaderUpgradable;
    stateToBeMigrated: Cell;
}

/// Wrapper of the argumennts for the init function of the new version.
/// Includes a lazyInitBit that is always set to false.
/// This is needed for contracts that have an init() function.
struct InitParamsWrapper {
    lazyInitBit: Bool; /// This bit is always set to false. It is appended at the beginig of the cell for contracts that have an init() function.
    initParams: InitParams; /// The initParams struct is used to pass the header and state to be migrated.
}

/// Wraps the InitParams struct into a cell for the init function of the new version.
fun wrapInitParams(initParams: InitParams): Cell {
    return InitParamsWrapper {
        lazyInitBit: false,
        initParams: initParams,
    }.toCell();
}

/// Implements a two step upgrade mechanism with data migration.
trait Upgradable with Ownable, TypeAndVersion {
    /// --- Ownable Attributes ---
    /// Contract owner address that can perform upgrades.
    owner: Address;

    /// --- Upgradable Attributes ---

    /// This is the code that will be used to upgrade the contract.
    upgradeToCommit: Upgrade?;

    virtual inline fun requireValidateUpgrade(_: Context, __: Upgrade) {
        self.requireOwner();
    }

    receive(msg: Upgrade) {
        let ctx = context();
        self.requireValidateUpgrade(ctx, msg);
        self.upgradeToCommit = msg;
    }

    virtual inline fun requireValidateCommitUpgrade(_: Context, __: CommitUpgrade) {
        self.requireOwner();
    }

    /// Returns the current state of the contract.
    /// This function is used to migrate the state from the old version to the new one.
    abstract fun getState(): Cell;

    receive(msg: CommitUpgrade) {
        let ctx = context();
        self.requireValidateCommitUpgrade(ctx, msg);

        self.upgrade(ctx, self.upgradeToCommit!!);
    }

    /// Returns the header for the initialization of the new version.
    virtual fun getNextHeader(): HeaderUpgradable {
        return HeaderUpgradable {
            owner: self.owner,
        };
    }

    /// Applies the upgrade to the contract stored in self.upgradeToCommit.
    virtual inline fun upgrade(_: Context, _upgrade: Upgrade) {
        // Change of code will be applied at the end of this transaction
        setCode(_upgrade.code);
        let header = self.getNextHeader();
        let stateToBeMigrated = self.getState();
        let initParams = wrapInitParams(InitParams {
            header: header,
            stateToBeMigrated: stateToBeMigrated,
        });
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

    /// Type must be a TitleCase string that is uinique to the contract and should not change betwen versions.
    override fun type(): String {
        return self.upgradableType();
    }

    /// --- Delegated TypeAndVersion Functions ---

    /// Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    abstract fun upgradableVersion(): String;

    /// Type must be a TitleCase string that is uinique to the contract and should not change betwen versions.
    abstract fun upgradableType(): String;
}

/// Change of code will be applied by the end of the current transaction.
asm fun setCode(code: Cell) { SETCODE }

/// Change of data is immediate.
asm fun setData(data: Cell) { c4 POP }
