// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/lisp-lists"
import "../../../lib/utils"

import "types"
import "messages"

struct ContextExecutor<T> {
	data: ContextExecutor_Data<T>;
}

@inline
fun ContextExecutor_Data<T>.fromContractData() {
	return ContextExecutor_Data<T>.fromCell(contract.getData());
}

@inline
fun ContextExecutor_Data<T>.storeAsContractData(self) {
	contract.setData(self.toCell());
}

@inline
fun ContextExecutor<T>.load(): ContextExecutor<T> {
	val data = ContextExecutor_Data<T>.fromContractData();
	return ContextExecutor<T> { data };
}

fun ContextExecutor<T>.store(self) {
	self.data.storeAsContractData();
}

fun ContextExecutor<T>.onInternalMessage(
	mutate self,
	forward: ContextExecutor_InMessageForward,
): bool {
	val msg = lazy ContextExecutor_InMessage<T>.fromCell(forward.body);

	match (msg) {
		ContextExecutor_Init<T> => {
			self.data.context = msg.context;
			self.data.forwardFrom = msg.forwardFrom;

			val reply = createMessage({
				bounce: true,
				value: 0,
				dest: forward.senderAddress,
				body: ContextExecutor_Reply<T> {
					queryId: msg.queryId,
					id: self.data.id,
					context: self.data.context,
					forwardFrom: self.data.forwardFrom,
					forwardPayload: beginCell().storeUint(0, 64).endCell() as Cell<T>,
				},
			});
            reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

			return true;
		}
		ContextExecutor_Ask => {
			val reply = createMessage({
				bounce: true,
				value: 0,
				dest: forward.senderAddress,
				body: ContextExecutor_Reply<T> {
					queryId: msg.queryId,
					id: self.data.id,
					context: self.data.context,
					forwardFrom: self.data.forwardFrom,
					forwardPayload: msg.forwardPayload,
				},
			});
            reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

			return true;
		}
		else => {
			if (self._isForwardSender(forward.senderAddress)) {
				val reply = createMessage({
					bounce: false,
					value: 0,
					dest: forward.senderAddress,
					body: ContextExecutor_ForwardNotification<T> {
						id: self.data.id,
						context: self.data.context,
						forwardFrom: self.data.forwardFrom,
						message: forward.toCell(),
					},
				});
                reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

				return true;
			}

			return forward.body.beginParse().isEmpty();
		}
	}
}

fun ContextExecutor<T>._isForwardSender(self, sender: address): bool {
	var iter = ArrayIterator<address>.new(self.data.forwardFrom);
	while (!iter.empty()) {
		if (iter.next() == sender) {
			return true;
		}
	}

	return false;
}

