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

struct Header {
    /// Owner of the contract.
    owner: Address;
    /// Previous version.
    _prev_version: Int as uint32;
    /// Active version.
    _blue_version: Int as uint32;
    /// New version.
    _green_version: Int as uint32;
    code_bkup: Cell?;
    code: Cell;
    data_bkup: Cell?;
}

struct HoleBody {
    Header: Header;
    Body: Cell as remaining;
}

/// Implements a blue/green upgrade mechanism with owner validation.
trait UpgradableBG with Ownable {
    /// Ownable
    owner: Address;

    /// UpgradableBG

    /// Previous version
    _prev_version: Int as uint32;
    /// Active version
    _blue_version: Int as uint32;
    /// New version
    _green_version: Int as uint32;
    code_bkup: Cell?;
    code: Cell;
    data_bkup: Cell?;

    virtual inline fun requireValidateUpgrade(_: Context, __: Upgrade) {
        self.requireOwner();
    }

    receive(msg: Upgrade) {
        dump("Upgrade");
        let ctx = context();
        self.requireValidateUpgrade(ctx, msg);
        self.code_bkup = msg.code;
        if msg.data != null {
            dump(msg.data!!.asSlice());
            let s = (msg.data!!).beginParse();
            dump("s.bits()");
            dump(s.bits().toString());
            // Header
            s.skipAddress(); // owner
            s.skipBits(32); // _prev_version
            s.skipBits(32); // _blue_version
            s.skipBits(32); // _green_version
            s.skipMaybeRef(); // code_bkup
            s.skipMaybeRef(); // code
            s.skipMaybeRef(); // data_bkup
            // Data
            dump("s.bits()");
            dump(s.bits().toString());
            let bits = s.bits();
            let body = s.loadBits(bits);
            dump(body);
            self.data_bkup = body.asCell();
            dump(self.data_bkup);
        } else {
            self.data_bkup = null;
        }

        self._green_version = self._blue_version + 1;
    }

    virtual inline fun requireValidateCommitUpgrade(_: Context, __: CommitUpgrade) {
        self.requireOwner();
    }

    abstract fun getData(): Cell;

    receive(msg: CommitUpgrade) {
        dump("CommitUpgrade");
        let ctx = context();
        self.requireValidateCommitUpgrade(ctx, msg);
        let code = self.code_bkup;
        let data = self.data_bkup;
        self.code_bkup = self.code;
        self._prev_version = self._blue_version;
        self._blue_version = self._green_version;
        if (data != null) {
            dump("CommitUpgrade data != null");
            self.data_bkup = self.getData();
            dump("CommitUpgrade self.getData()");
            dump(self.data_bkup);
        } else {
            dump("CommitUpgrade data == null");
            self.data_bkup = null;
        }

        self.upgrade(ctx, code, data);
    }

    fun getHeader(): Header {
        return Header {
            owner: self.owner,
            _prev_version: self._prev_version,
            _blue_version: self._blue_version,
            _green_version: self._green_version,
            code_bkup: self.code_bkup,
            code: self.code,
            data_bkup: self.data_bkup,
        };
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
        if (data != null) {
            dump("RollbackUpgrade data != null");
            self.data_bkup = self.getData();
        } else {
            dump("RollbackUpgrade data == null");
            self.data_bkup = null;
        }

        self._blue_version = self._prev_version;
        self._green_version = self._blue_version + 1;
        dump(beginString().concat("RollbackUpgrade _blue_version = ").concat(self._blue_version.toString()).toString());
        dump(beginString().concat("RollbackUpgrade _prev_version = ").concat(self._prev_version.toString()).toString());
        dump(beginString().concat("RollbackUpgrade _green_version = ").concat(self._green_version.toString()).toString());
        self.upgrade(ctx, code, data);
    }

    /// Sets the code if it's not `null`.
    /// Sets the data if it's not `null`.
    /// Can be overridden.
    virtual inline fun upgrade(_: Context, code: Cell?, body: Cell?) {
        if (code != null) {
            // Change of code will be applied at the end of this transaction

            self.code = code!!;
            setCode(code!!);
        }
        if (body != null) {
            let header = self.getHeader();
            let completeData = HoleBody {
                Header: header,
                Body: body!!,
            };
            // Change of body will be immediate
            setData(completeData.toCell());
            dump("setData completed");

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
