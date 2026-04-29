// SPDX-License-Identifier: MIT
import "../../../lib/utils";
import "../../../lib/access/ownable_2step";
import "../../../lib/funding/withdrawable";

const WithdrawableWallet_FACILITY_NAME = "link.chain.ton.examples.funding.WithdrawableWallet";
const CONTRACT_VERSION = "1.0.1";

struct Storage {
    id: uint32;
    ownable2Step: Ownable2Step;
    reserve: coins;
}

fun loadData() {
    return Storage.fromCell(contract.getData());
}

fun saveData(data: Storage) {
    contract.setData(data.toCell());
}

type IncomingMessage = Withdrawable_Withdraw;

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
    return ("link.chain.ton.examples.funding.WithdrawableWallet", CONTRACT_VERSION);
}

get fun facilityId(): uint16  {
    return getFacilityId(stringCrc32("link.chain.ton.examples.funding.WithdrawableWallet"));
}

get fun errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("link.chain.ton.examples.funding.WithdrawableWallet"), local);
}

get fun reserve(): coins {
    var storage: Storage = loadData();
    return storage.reserve;
}
