import "@stdlib/ownable";
import "../lib/type_and_version";

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

@interface("com.chainlink.ton.upgradable")
/// Implements a two step upgrade mechanism with data migration.
trait Upgradable with Ownable, TypeAndVersion {
    /// --- Ownable Attributes ---
    /// Contract owner address that can perform upgrades.
    owner: Address;

    /// --- Upgradable Functions ---
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
        setCode(_upgrade.code);

        // Step 2: State Migration
        //
        // All upgradable contracts must have an init() function that handles
        // the migrating data from the old version to the new version.
        //
        // The init() function must receive one argument: a Cell containing
        // the data to be migrated.
        //
        // All contracts with an init() function have a _lazyDeploymentBit at 
        // the beginning of their storage layout. Setting it to false ensures
        // the init() function will be called.
        let initParams = LazyDeploymentLayout {
            _lazyDeploymentBit: false,
            data: getData(), // Current state to be migrated
        }.toCell();

        // Apply the initial state for the new version. Changes take effect
        // immediately, but contract attributes won't be repopulated until
        // the end of the transaction.
        setData(initParams);

        // Step 3: Execution Control
        // The Tact compiler automatically adds a setData() call at the end
        // of every transaction. Since we've already set our data properly,
        // we must halt execution to prevent a double setData() call which
        // could corrupt our state.
        throw(0);
    }

    /// --- TypeAndVersion Functions ---

    /// Version must be a semantic version string (e.g. "1.0.0").
    override fun version(): String {
        return self.upgradableVersion();
    }

    // Type must be a Reverse Domain Name Notation string that is unique to the contract and should not change between versions.
    // Example: "com.chainlink.project.package.ContractName"
    // Read more about Reverse DNS Notation at https://en.wikipedia.org/wiki/Reverse_domain_name_notation
    override fun type(): String {
        return self.upgradableType();
    }

    /// --- Delegated TypeAndVersion Functions ---

    /// Version must be a semantic version string (e.g. "1.0.0").
    abstract fun upgradableVersion(): String;

    // Type must be a Reverse Domain Name Notation string that is unique to the contract and should not change between versions.
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
