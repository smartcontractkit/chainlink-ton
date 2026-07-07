// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/lisp-lists"
import "../../../lib/utils"

import "types"
import "messages"

struct ContextExecutor<T> {
	data: ContextExecutor_Data<T>;
}

fun ContextExecutor<T>.onInternalMessage(
	mutate self,
	in: ContextExecutor_InMessageForward,
): bool {
	val msg = lazy ContextExecutor_InMessage<T>.fromCell(in.body);

	match (msg) {
		ContextExecutor_Set<T> => {
            assert(self.data.owner == in.senderAddress) throw ContextExecutor_Error.OnlyCallableByOwner;

			self.data.context = msg.context;
			self.data.forwardFrom = msg.forwardFrom;

			val reply = createMessage({
				bounce: BounceMode.NoBounce,
				value: 0,
				dest: in.senderAddress,
				body: ContextExecutor_Reply<T> {
					queryId: msg.queryId,
					id: self.data.id,
					context: self.data.context,
					forwardFrom: self.data.forwardFrom,
					forwardPayload: beginCell().storeUint(0, 64).endCell() as Cell<T>,
                    done: false,
				},
			});
            reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

			return true;
		}
		ContextExecutor_Ask => {
			val reply = createMessage({
				bounce: BounceMode.NoBounce,
				value: 0,
				dest: in.senderAddress,
				body: ContextExecutor_Reply<T> {
					queryId: msg.queryId,
					id: self.data.id,
					context: self.data.context,
					forwardFrom: self.data.forwardFrom,
					forwardPayload: msg.forwardPayload,
                    done: msg.done, // as requested
				},
			});
            val mode = msg.done
                ? SEND_MODE_CARRY_ALL_BALANCE
                : SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE;
            reply.send(mode);

			return true;
		}
		else => {
			if (self._isForwardSender(in.senderAddress)) {
				val reply = createMessage({
					bounce: BounceMode.NoBounce,
					value: 0,
					dest: self.data.owner,
					body: ContextExecutor_ForwardNotification<T> {
						id: self.data.id,
						context: self.data.context,
						forwardFrom: self.data.forwardFrom,
						message: in.toCell(),
					},
				});
                reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

				return true;
			}

			return in.body.beginParse().isEmpty();
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
