import "messages"
import "../../pools/messages"

contract MockTokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.1"
    description: "link.chain.ton.ccip.test.TokenPool"
    incomingMessages: MockTokenPool_LockOrBurn
}

const CONTRACT_VERSION = "0.0.1".literalSlice();

fun onInternalMessage(in: InMessage) {
	val msg = lazy MockTokenPool_LockOrBurn.fromSlice(in.body);
	val notification = createMessage({
		bounce: false,
		value: 0,
		dest: msg.notify,
		body: TokenPool_NotifySuccessfulLockOrBurn {},
	});
	notification.send(SEND_MODE_CARRY_ALL_BALANCE);
}
