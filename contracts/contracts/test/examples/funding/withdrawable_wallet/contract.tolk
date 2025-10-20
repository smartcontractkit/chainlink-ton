import "../../../../lib/utils.tolk";
import "../../../../lib/access/ownable_2step.tolk";
import "../../../../lib/funding/withdrawable.tolk";
import "./storage.tolk";

type IncomingMessage = Withdrawable_Withdraw;

fun loadData() {
    return Storage.fromCell(contract.getData());
}

fun saveData(data: Storage) {
    contract.setData(data.toCell());
}

const FACILITY_NAME = "com.chainlink.ton.examples.funding.WithdrawableWallet";
const CONTRACT_VERSION = "1.0.0";

fun onInternalMessage(in: InMessage) {
    val sender = in.senderAddress;
    var storage: Storage = loadData();
    var handled = storage.ownable2Step.onInternalMessage(sender, in.body);

    if (handled) {
        saveData(storage);
        return;
    }

    val msg = lazy IncomingMessage.fromSlice(in.body);

    match (msg) {
        Withdrawable_Withdraw => {
            storage.ownable2Step.requireOwner(sender);
            Withdrawable{
                reserve: storage.reserve
            }.withdraw(msg, in.valueCoins);
        }
        else => {
            assert (in.body.isEmpty()) throw 63;
        },
    }
}

/// Gets the current owner of the contract.
get fun owner(): address {
    val storage = loadData();
    return storage.ownable2Step.get_owner();
}

/// Gets the pending owner of the contract, if any.
get fun pendingOwner(): address? {
    val storage = loadData();
    return storage.ownable2Step.get_pendingOwner();
}

get fun typeAndVersion(): (slice, slice) {
    return (FACILITY_NAME, CONTRACT_VERSION);
}

// Returns the current code of the contract.
get fun code(): cell {
    return contract.getCode();
}

// Returns the sha256 hash of the current code of the contract.
get fun codeHash(): int {
    return contract.getCode().hash();
}

get fun facilityId(): uint16  {
    return getFacilityId(stringCrc32("com.chainlink.ton.examples.funding.WithdrawableWallet"));
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("com.chainlink.ton.examples.funding.WithdrawableWallet"), local);
}

get fun reserve(): coins {
    var storage: Storage = loadData();
    return storage.reserve;
}
