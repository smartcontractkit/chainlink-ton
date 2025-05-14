import "@stdlib/ownable";

/// Message for upgrading contract code and data.
message(10) Upgrade {
    code: Cell;
    // init_data: Cell;
}

message(11) CommitUpgrade {}

message(12) RollbackUpgrade {}

message(13) MigrateData {}

const UpgradeCommited: Int = 1001;

struct Header {
    /// Owner of the contract.
    owner: Address;
    /// Previous version.
    _version: Int as uint32;
}

struct InitParamsWithBit {
    lazyInit: Bool;
    initParams: InitParams;
}

struct InitParams {
    header: Header;
    stateToBeMigrated: Cell;
}

// struct HoleBody {
//     Header: Header;
//     Body: Cell as remaining;
// }

/// Implements a blue/green upgrade mechanism with owner validation.
trait UpgradableBG with Ownable {
    /// Ownable
    owner: Address;

    /// UpgradableBG
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

    fun getNextHeader(): Header {
        return Header {
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
            lazyInit: false,
            initParams: InitParams {
                header: header,
                stateToBeMigrated: stateToBeMigrated,
            },
        }.toCell();
        dump(header.toSlice());
        dump(stateToBeMigrated.asSlice());
        dump(initParams.asSlice());
        // Change of body will be immediate
        setData(initParams);
        dump("setData completed");

        // By the end of every transaction,
        // the Tact compiler automatically adds a call to setData() for your convenience.
        // However, we've already set the data ourselves,
        // so let's stop the execution now to prevent a secondary call to setData().
        throw(0);
    }

    virtual inline fun requireValidateMigrateData(_: Context, __: MigrateData) {
        // throwUnless(TactExitCodeAccessDenied, sender() == self.address());
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
