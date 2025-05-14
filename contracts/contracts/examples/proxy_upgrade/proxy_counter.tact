import "../../lib/upgradeable";
import "../getter";
import "../responder";
import "./counter_trait";
import "./upgradeable_proxy_child";

struct ReturnAddress {
    address: Address;
    callbackOpcode: Int as uint32;
}

message(30) UpdateCounterAddress {
    address: Address;
}

message(31) RequestedState {
    stateToBeMigrated: Cell;
}

contract ProxyCounter with Responder, ICounter, Upgradable {
    /// Ownable
    owner: Address;

    /// Upgradable
    /// New version
    _version: Int as uint32;
    upgradeToCommit: Upgrade?;

    /// ProxyCounter

    id: Int as uint32;
    counterAddress: Address;
    requests: map<Int as uint32, ReturnAddress>;

    init(
        id: Int,
        owner: Address,
        counterAddress: Address,
    ) {
        self.id = id;
        self.owner = owner;
        self.counterAddress = counterAddress;
        self._version = 1;
        self.requests = emptyMap();
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
        // Change of code will be applied at the end of this transaction
        message(MessageParameters {
            mode: SendRemainingValue,
            body: GetState {}.toCell(),
            value: 0,
            to: self.counterAddress,
            bounce: true,
        });
    }

    receive(msg: RequestedState) {
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

    get fun id(): Int {
        return self.id;
    }
}
