import "../../../lib/utils"
import "../../pools/lib/token_pool/messages"
import "../../pools/lib/token_pool/types"
import "../../common/types"

import "messages"

contract MockTokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.1"
    description: "link.chain.ton.ccip.test.MockTokenPool"
    storage: MockTokenPool_Storage
    incomingMessages: MockTokenPool_InMessage
}

const CONTRACT_VERSION = "0.0.1".literalSlice();

fun MockTokenPool_Storage.load(): MockTokenPool_Storage {
	return MockTokenPool_Storage.fromCell(contract.getData());
}

fun MockTokenPool_Storage.store(self) {
	contract.setData(self.toCell());
}

fun onInternalMessage(in: InMessage) {
	val msg = lazy MockTokenPool_InMessage.fromSlice(in.body);
	match (msg) {
		// Configure the remote (destination) token address, mirroring the real TokenPool's
		// applyChainUpdates. To stay minimal the mock keeps a single address (last write wins)
		// rather than a per-remote-chain map, and ignores rate limits / remote pools.
		TokenPool_ApplyChainUpdates => {
			var state = MockTokenPool_Storage.load();
			var addIter = msg.chainsToAdd.iter();
			while (!addIter.empty()) {
				val newChain = addIter.next();
				state.destTokenAddress = newChain.remoteTokenAddress;
			}
			state.store();
		}
		MockTokenPool_LockOrBurn => {
			val state = MockTokenPool_Storage.load();
			val notification = createMessage({
				bounce: false,
				value: 0,
				dest: msg.notify,
				body: TokenPool_LockOrBurnFinished {
					queryId: 0,
					out: (TokenPool_LockOrBurnOutV1 {
						destTokenAddress: state.destTokenAddress,
						destPoolData: createEmptyCell(),
					}).toCell(),
					destTokenAmount: msg.tokenAmount.amount,
				},
			});
			notification.send(SEND_MODE_CARRY_ALL_BALANCE);
		}
	}
}
