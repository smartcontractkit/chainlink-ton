import "../../lib/upgradable";
import "../getter";
import "../responder";
import "../counter_trait";

/// Addres and callbackOpcode of a requester
struct ReturnAddress {
    address: Address;
    callbackOpcode: Int as uint32;
}

/// Message returned by the child after initialization with the updated version
message(30) UpdateCounterVersion {
    version: String;
}

/// This is sent to the proxy's child to request the currennt state.
message(40) GetState {}

/// This is the response to the GetState message.
message(31) RequestedState {
    stateToBeMigrated: Cell;
}

/// This contract implements ICounter as the proxy entrypoint of a counter.
contract ProxyCounter with Responder, ICounter, Upgradable {
    /// --- Upgradable Attributes ---
    /// Contract owner address that can perform upgrades.
    owner: Address;

    /// This is the code that will be used to upgrade the contract.
    pendingUpgrade: Upgrade?;

    /// --- ProxyCounter Attributes ---

    /// id of the counter.
    id: Int as uint32;
    /// Address of the child contract.
    counterAddress: Address;
    /// Count requests by queryId with the address and callbackOpcode of the requester.
    requests: map<Int as uint32, ReturnAddress>;
    /// Version of the contract.
    version: String;

    init(
        id: Int,
        owner: Address,
        counterAddress: Address,
    ) {
        self.id = id;
        self.owner = owner;
        self.counterAddress = counterAddress;
        self.requests = emptyMap();
        self.version = "1.0.0";
    }

    /// --- ProxyCounter Functions ---

    /// Get the id of the contract.
    get fun id(): Int {
        return self.id;
    }

    /// Catch the response from the child contract and send it back to the requester.
    receive(msg: Set) {
        let returnAddress = self.requests.get(msg.queryId)!!;
        message(MessageParameters {
            mode: SendRemainingValue,
            body: beginCell()
                .storeUint(returnAddress.callbackOpcode, 32)
                .storeUint(msg.queryId, 64)
                .storeUint(msg.value, 64)
                .endCell(),
            value: 0,
            to: returnAddress.address,
            bounce: true,
        });
        let _ = self.requests.del(msg.queryId);
    }

    /// --- ICounter Functions ---

    /// Handle step instruction

    /// Update counter
    override fun handle_step(queryId: Int) {
        message(MessageParameters {
            mode: SendRemainingValue,
            body: Step {
                queryId: queryId,
            }.toCell(),
            value: 0,
            to: self.counterAddress,
            bounce: true,
        });
    }

    /// --- Responder Functions ---

    /// Respond to a request, returning a value to the sender() in the callbackOpcode.
    override fun respond(msg: Request, sender: Address) {
        self.requests.set(msg.queryId, ReturnAddress {
            address: sender(),
            callbackOpcode: msg.callbackOpcode,
        });
        message(MessageParameters {
            mode: SendRemainingValue,
            body: Request {
                queryId: msg.queryId,
                callbackOpcode: setOpcode,
            }.toCell(),
            value: 0,
            to: self.counterAddress,
            bounce: true,
        });
    }

    /// --- Upgradable Functions ---
    /// The upgrade is split into three steps:

    /// 1. Request the state from the child contract.
    override fun upgrade(_: Context, _upgrade: Upgrade) {
        self.pendingUpgrade = _upgrade;
        message(MessageParameters {
            mode: SendRemainingValue,
            body: GetState {}.toCell(),
            value: 0,
            to: self.counterAddress,
            bounce: true,
        });
    }

    /// Returns the header for the initialization of the new version.
    override fun getNextHeader(): HeaderUpgradable {
        return HeaderUpgradable {
            owner: myAddress(),
        };
    }

    /// 2. Deploy the new version of the child contract with the state from the old version.
    receive(msg: RequestedState) {
        let header = self.getNextHeader();
        let initParams = wrapInitParams(InitParams {
            header: header,
            stateToBeMigrated: msg.stateToBeMigrated,
        });

        let counterStateInit = StateInit {
            code: self.pendingUpgrade!!.code,
            data: initParams,
        };

        deploy(DeployParameters {
            mode: SendRemainingValue,
            body: null,
            value: 0,
            bounce: true,
            init: counterStateInit,
        });

        self.counterAddress = contractAddress(counterStateInit);
    }

    /// 3. The child contract sends the new version.
    receive(msg: UpdateCounterVersion) {
        self.version = msg.version;
    }

    /// DO NOT CALL: This is normally used by the upgrade function to get the state of the contract, but as this is a proxy, it is not used.
    override fun getState(): Cell {
        throw(500); // Unreachable
    }

    // Type must be a Reverse Domain Name Notation string that is uinique to the contract and should not change betwen versions.
    // Example: "com.chainlink.project.package.ContractName"
    // Read more about Reverse DNS Notation at https://en.wikipedia.org/wiki/Reverse_domain_name_notation
    override fun upgradableVersion(): String {
        return self.version;
    }

    // Type must be a Reverse Domain Name Notation string that is uinique to the contract and should not change betwen versions.
    // Example: "com.chainlink.project.package.ContractName"
    // Read more about Reverse DNS Notation at https://en.wikipedia.org/wiki/Reverse_domain_name_notation
    override fun upgradableType(): String {
        return "com.chainlink.ton.examples.proxy_upgrade.ProxyCounter";
    }
}
