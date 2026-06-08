import "messages"

contract MockTokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.1"
    description: "link.chain.ton.ccip.test.TokenPool"
    incomingMessages: MockTokenPool_LockOrBurn
}

fun onInternalMessage(in: InMessage) {
	val msg = lazy MockTokenPool_LockOrBurn.fromSlice(in.body);
	notification = createMessage({
		bounce: false,
		value: 0,
		dest: msg.notify,
		body: MockTokenPool_NotifySuccessfulLockOrBurn {},
	});
	notification.send(SEND_MODE_CARRY_ALL_BALANCE);
}
