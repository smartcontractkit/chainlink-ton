import "../../pools/lib/token_pool/messages"
import "../../pools/lib/token_pool/types"

import "messages"

contract MockTokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.1"
    description: "link.chain.ton.ccip.test.TokenPool"
	storage: Storage
    incomingMessages: MockTokenPool_LockOrBurn
}

const CONTRACT_VERSION = "0.0.1".literalSlice();

struct Storage {
}


fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    contract.setData(self.toCell());
}


fun onInternalMessage(in: InMessage) {
	val msg = lazy MockTokenPool_LockOrBurn.fromSlice(in.body);
	val notification = createMessage({
		bounce: false,
		value: 0,
		dest: msg.notify,
		body: TokenPool_LockOrBurnFinished {
			queryId: 0,
			out: createEmptyCell() as Cell<TokenPool_LockOrBurnOutV1>,
			destTokenAmount: 0,
		},
	});
	notification.send(SEND_MODE_CARRY_ALL_BALANCE);
}
