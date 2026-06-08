struct (0x98769876) MockTokenPool_LockOrBurn {
	tokenAmount: TokenAmount,
	notify: address,
}

struct (0x87658765) MockTokenPool_NotifySuccessfulLockOrBurn {}

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
