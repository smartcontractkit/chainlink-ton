import "../../lib/upgradable";
import "../getter";
import "../responder";
import "../counter_trait";

struct ReturnAddress {
    address: Address;
    callbackOpcode: Int as uint32;
}

message(30) UpdateCounterVersion {
    version: String;
}

/// This is sent to the proxy child to request the state to be migrated.
message(40) GetState {}

/// This is the response to the GetState message.
message(31) RequestedState {
    stateToBeMigrated: Cell;
}

contract ProxyCounter with Responder, ICounter, Upgradable {
    /// Ownable
    owner: Address;

    /// Upgradable
    upgradeToCommit: Upgrade?;

    /// ProxyCounter

    id: Int as uint32;
    counterAddress: Address;
    requests: map<Int as uint32, ReturnAddress>;
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
    }

    override fun upgrade(_: Context, _upgrade: Upgrade) {
        message(MessageParameters {
            mode: SendRemainingValue,
            body: GetState {}.toCell(),
            value: 0,
            to: self.counterAddress,
            bounce: true,
        });
        dump(self.counterAddress);
    }

    receive(msg: RequestedState) {
        dump("RequestedState");
        let header = self.getNextHeader();
        let initParams = InitParamsWithBit {
            lazyInitBit: false,
            initParams: InitParams {
                header: header,
                stateToBeMigrated: msg.stateToBeMigrated,
            },
        }.toCell();

        let counterStateInit = StateInit {
            code: self.upgradeToCommit!!.code,
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

    override fun getState(): Cell {
        throw(500); // Unreachable
    }

    receive(msg: UpdateCounterVersion) {
        dump("UpdateCounterVersion");
        dump(msg.version);
        self.version = msg.version;
    }

    override fun upgradableVersion(): String {
        return self.version;
    }

    override fun upgradableType(): String {
        return "ProxyCounter";
    }

    get fun id(): Int {
        return self.id;
    }
}
