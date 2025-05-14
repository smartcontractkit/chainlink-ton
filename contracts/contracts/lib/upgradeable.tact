import "@stdlib/ownable";

/// Message for upgrading contract code and data.
message(10) Upgrade {
    code: Cell;
}

message(11) CommitUpgrade {}

/// Not impelemented yet.
message(12) RollbackUpgrade {}

/// This are the internal variables all upgradeable contracts should have.
/// It is used to migrate the state from the old version to the new one.
struct HeaderUpgradeable {
    owner: Address; /// Owner of the contract.
    _version: Int as uint32; /// Previous version.
}

/// Data for the init function of the new version.
struct InitParamsWithBit {
    lazyInitBit: Bool; /// This bit is always set to false. It is appended at the beginig of the cell for contracts that have an init() function.
    initParams: InitParams; /// The initParams struct is used to pass the header and state to be migrated.
}

/// Data for the init function of the new version.
struct InitParams {
    header: HeaderUpgradeable; /// 
    stateToBeMigrated: Cell;
}

/// Implements a two step upgrade mechanism with data migration.
trait Upgradable with Ownable {
    /// Ownable
    owner: Address;

    /// Upgradable
    /// New version
    _version: Int as uint32;
    upgradeToCommit: Upgrade?;

    virtual inline fun requireValidateUpgrade(_: Context, __: Upgrade) {
        self.requireOwner();
    }

    receive(msg: Upgrade) {
        dump("Upgrade");
        let ctx = context();
        self.requireValidateUpgrade(ctx, msg);
        self.upgradeToCommit = msg;
    }

    virtual inline fun requireValidateCommitUpgrade(_: Context, __: CommitUpgrade) {
        self.requireOwner();
    }

    abstract fun getState(): Cell;

    receive(msg: CommitUpgrade) {
        dump("CommitUpgrade");
        let ctx = context();
        self.requireValidateCommitUpgrade(ctx, msg);

        self.upgrade(ctx, self.upgradeToCommit!!);
    }

    fun getNextHeader(): HeaderUpgradeable {
        return HeaderUpgradeable {
            owner: self.owner,
            _version: self._version,
        };
    }

    /// Can be overridden.
    virtual inline fun upgrade(_: Context, _upgrade: Upgrade) {
        // Change of code will be applied at the end of this transaction
        setCode(_upgrade.code);
        let header = self.getNextHeader();
        let stateToBeMigrated = self.getState();
        let initParams = InitParamsWithBit {
            lazyInitBit: false,
            initParams: InitParams {
                header: header,
                stateToBeMigrated: stateToBeMigrated,
            },
        }.toCell();
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

    /// A getter returning the current version of the contract.
    get fun version(): Int {
        return self._version;
    }
}

/// Change of code will be applied by the end of the current transaction.
asm fun setCode(code: Cell) { SETCODE }

/// Change of data is immediate.
asm fun setData(data: Cell) { c4 POP }
