import "@stdlib/ownable";

/// Message for upgrading contract code and data.
message(10) Upgrade {
    code: Cell;
    init_data: Cell;
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
    upgradeToCommit: Upgrade?;
    state_tb_migrated: Cell?;
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
    state_tb_migrated: Cell?;

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

        self.state_tb_migrated = self.getState();
        self.upgrade(ctx, self.upgradeToCommit!!);
    }

    fun getNextHeader(): Header {
        return Header {
            owner: self.owner,
            _version: self._version + 1,
            upgradeToCommit: null,
            state_tb_migrated: self.state_tb_migrated,
        };
    }

    /// Can be overridden.
    virtual inline fun upgrade(_: Context, _upgrade: Upgrade) {
        // Change of code will be applied at the end of this transaction
        setCode(_upgrade.code);
        // TODO figuere out if we can send a message to self for migrating data
        let header = self.getNextHeader();
        // let completeData = HoleBody {
        //     Header: header,
        //     Body: _upgrade.init_data,
        // };
        let completeData = beginCell()
            .storeSlice(header.toSlice())
            .storeSlice(_upgrade.init_data.asSlice())
            .endCell();
        dump(header.toSlice());
        dump(_upgrade.init_data.asSlice());
        dump(completeData.asSlice());
        // Change of body will be immediate
        setData(completeData);
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

    receive(msg: MigrateData) {
        dump("MigrateData");
        let ctx = context();
        self.requireValidateMigrateData(ctx, msg);
        self.migrateData();
    }

    abstract fun migrateData();

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
