import "./type_and_version";
import "../access/ownable_2step";

/// Message for upgrading a contract.
message(10) Upgrade {
    code: Cell;
}

/// Storage Cell layout for the initialization of the new version.
struct LazyDeploymentLayout {
    /// for contracts with init() function
    _lazyDeploymentBit: Bool;
    /// state to be migrated
    data: Cell;
}

struct UpgradedEvent {
    /// The version of the contract after the upgrade.
    version: String;
    /// The new code of the contract.
    code: Cell;
    /// The SHA256 hash of the new code.
    sha: Int as uint256;
}

/// Implements a two step upgrade mechanism with data migration.
@interface("com.chainlink.ton.upgradeable")
trait Upgradeable with Ownable2Step, TypeAndVersion {
    /// --- Ownable2Step Attributes ---
    /// Contract owner address that can perform upgrades.
    owner: Address;
    pendingOwner: Address?;

    /// --- Upgradeable Functions ---
    ///
    virtual inline fun requireValidUpgrade(_: Context, __: Upgrade) {
        self.requireOwner();
    }

    receive(msg: Upgrade) {
        let ctx = context();
        self.requireValidUpgrade(ctx, msg);
        self.upgrade(ctx, msg);
    }

    /// Applies the upgrade to the contract. This happens in three steps:
    /// 1. Code Replacement
    /// 2. State Migration
    /// 3. Execution Control
    inline fun upgrade(_: Context, _upgrade: Upgrade) {
        // Step 1: Code Replacement
        // Change the contract code to the new version. This change becomes
        // effective by the end of the compute phase of the transaction.
        let data = getData();
        dump("Upgrading contract version");
        setCode(_upgrade.code);
        dump("New code set successfully.");
        let newData = self.migrate(data);
        setData(newData);

        // // Step 3: Execution Control
        // // The Tact compiler automatically adds a setData() call at the end
        // // of every transaction. Since we've already set our data properly,
        // // we must halt execution to prevent a double setData() call which
        // // could corrupt our state.
        self.emitUpgradeEvent();
        throw(0); // Success exit code
    }

    abstract fun migrate(stateToBeMigrated: Cell): Cell;

    /// Sends an outgoing external message with the version, code, and SHA256 hash of the new code.
    fun emitUpgradeEvent() {
        let code = getCode();
        let sha = code.hash();
        emit(UpgradedEvent {
            version: self.version(),
            code,
            sha,
        }.toCell());
    }
}

/// Changes the code of the contract.
/// It will be applied by the end of the current transaction.
inline fun setCode(code: Cell) {
    _setCode(code.asSlice());
    // _setCodeCell(code);
}

asm fun _setCodeCell(code: Cell) { 
    c3 POP
}

asm fun _setCode(code: Slice) { 
    BLESS
    c3 POP
}

/// Changes the storage cell of the contract.
/// The change is immediate, but the attributes won't be repopulated.
asm fun setData(data: Cell) { c4 POP }

/// Returns the current storage cell of the contract.
@name(get_data)
native getData(): Cell;
