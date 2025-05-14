import "../../lib/upgradeable";
import "../responder";
import "./counter_trait";
import "../getter";

struct ReturnAddress {
    address: Address;
    callbackOpcode: Int as uint32;
}

message(30) UpdateCounterAddress {
    address: Address;
}

contract ProxyCounter with Responder, ICounter, Upgradable {
    id: Int as uint32;
    owner: Address;
    counterAddress: Address;
    requests: map<Int as uint32, ReturnAddress>;
    _version: Int as uint32;

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

    override fun upgrade(_: Context, msg: Upgrade) {
        let counterStateInit = StateInit {
            code: msg.code!!,
            data: emptyCell(),
        };
        if msg.data != null {
            counterStateInit.data = msg.data!!;
        } else {
            throw(2000);
            // counterStateInit.data = self.data?;
        }

        deploy(DeployParameters {
            mode: SendRemainingValue,
            body: null,
            value: 0,
            bounce: true,
            init: counterStateInit,
        });

        self.counterAddress = contractAddress(counterStateInit);
    }

    get fun id(): Int {
        return self.id;
    }
}
